"""The discovery graph (tech plan §4).

    plan_queries -> search -> triage -> investigate -> select -> finalize

Nodes are built as closures over (cfg, llm) so run settings and the model
handle don't have to live in graph state. investigate runs the per-candidate
ReAct-ish loop (fetch home -> pick volunteer page -> fetch -> mini triage ->
full judgment) as a plain function; LangGraph provides the outer state machine.
"""

from __future__ import annotations

import time

from langgraph.graph import StateGraph, START, END

from . import config, tools
from .llm import LLM, parse_json
from .prompts import VOLUNTEER_PAGE_PICKER, LOCAL_ORG_TRIAGE, FINAL_JUDGMENT
from .state import DiscoveryState
from .tools import TAXONOMY

MAX_PAGE_CHARS = 8_000  # cap page text sent to the LLM (cost + context)


# ── plan_queries ─────────────────────────────────────────────────────────────
def make_plan_queries(cfg: config.RunConfig):
    def plan_queries(state: DiscoveryState) -> DiscoveryState:
        coverage, coverage_domains = tools.load_coverage()
        ledger = tools.load_ledger()

        # Search grid: cause keyword x DFW city, rotated by month so runs differ.
        cause_phrases = [
            "food pantry volunteer", "animal rescue volunteers",
            "nonprofit volunteer opportunities", "senior services volunteer",
            "homeless shelter volunteer", "tutoring volunteer",
        ]
        month = int(time.strftime("%m"))
        cities = config.DFW_CITIES
        # Rotate the city window monthly.
        start = (month * 5) % len(cities)
        rotated = cities[start:] + cities[:start]
        queries = [
            f"{phrase} {city}"
            for city in rotated
            for phrase in cause_phrases
        ][: cfg.max_queries]

        print(f"[plan_queries] coverage={len(coverage)} names, "
              f"{len(coverage_domains)} domains; ledger={len(ledger)}; "
              f"{len(queries)} queries")
        return {
            "coverage": coverage,
            "coverage_domains": coverage_domains,
            "ledger": ledger,
            "queries": queries,
        }
    return plan_queries


# ── search ───────────────────────────────────────────────────────────────────
def make_search(cfg: config.RunConfig):
    def search(state: DiscoveryState) -> DiscoveryState:
        # Seeded dry-run (tech plan §10 session 1): investigate hand-picked
        # domains directly, no Tavily call.
        if cfg.seed_domains:
            cands = [
                {"name": "", "domain": tools.domain_of(d),
                 "url": d if "://" in d else f"https://{d}", "snippet": ""}
                for d in cfg.seed_domains
            ]
            print(f"[search] seeded with {len(cands)} hand-picked domain(s)")
            return {"candidates": cands}

        seen: set[str] = set()
        cands: list[dict] = []
        for q in state["queries"]:
            for r in tools.web_search(q, k=cfg.search_k):
                dom = r["domain"]
                if dom and dom not in seen:
                    seen.add(dom)
                    cands.append(r)
        print(f"[search] {len(cands)} unique-domain candidate(s)")
        return {"candidates": cands}
    return search


# ── triage ───────────────────────────────────────────────────────────────────
def make_triage(cfg: config.RunConfig):
    def triage(state: DiscoveryState) -> DiscoveryState:
        ledger = state.get("ledger", {})
        coverage = state.get("coverage", set())
        coverage_domains = state.get("coverage_domains", set())
        kept: list[dict] = []
        for c in state.get("candidates", []):
            dom = c["domain"]
            if not dom or dom in config.BLOCKLIST_DOMAINS:
                continue
            if dom in ledger:
                continue  # already judged in a past run
            cov = tools.check_coverage(c["name"], dom, coverage, coverage_domains)
            if cov["known"]:
                continue
            kept.append(c)
        kept = kept[: cfg.max_candidates]
        print(f"[triage] {len(kept)} candidate(s) survive "
              f"(from {len(state.get('candidates', []))})")
        return {"candidates": kept}
    return triage


# ── investigate ──────────────────────────────────────────────────────────────
def _investigate_one(cand: dict, cfg: config.RunConfig, llm: LLM) -> dict:
    """Fetch home -> pick volunteer page -> fetch -> mini triage -> full
    judgment. Returns a Verdict dict (always, even on failure)."""
    domain, name = cand["domain"], cand.get("name", "")
    base = {"domain": domain, "name": name, "volunteer_url": None,
            "evidence_quotes": [], "draft_entry": None}

    home = tools.fetch_page(cand["url"])
    if not home:
        return {**base, "decision": "reject", "confidence": 0.0,
                "reason": "homepage fetch failed"}

    # Pick the volunteer page: heuristics first (find_volunteer_links already
    # ranked them), LLM only to disambiguate.
    vol_url = home["links"][0] if home["links"] else None
    if len(home["links"]) > 1:
        raw = llm.mini(VOLUNTEER_PAGE_PICKER.replace("{links}", "\n".join(home["links"])))
        picked = (parse_json(raw) or {}).get("url")
        if picked in home["links"]:
            vol_url = picked

    page = tools.fetch_page(vol_url) if vol_url else home
    vol_url = vol_url or cand["url"]
    page_text = (page or home)["text"][:MAX_PAGE_CHARS]

    # Cheap triage (biased toward keep).
    raw = llm.mini(LOCAL_ORG_TRIAGE.replace("{page_text}", page_text))
    tri = parse_json(raw) or {}
    if tri.get("keep") is False:
        return {**base, "volunteer_url": vol_url, "decision": "reject",
                "confidence": 0.2, "reason": tri.get("why", "failed local triage")}

    # Full judgment (biased toward reject).
    raw = llm.full(FINAL_JUDGMENT
                   .replace("{taxonomy}", ", ".join(TAXONOMY))
                   .replace("{name}", name)
                   .replace("{url}", vol_url)
                   .replace("{page_text}", page_text))
    j = parse_json(raw) or {}
    return {
        **base,
        "volunteer_url": vol_url,
        "decision": "accept" if str(j.get("decision")).lower() == "accept" else "reject",
        "confidence": float(j.get("confidence") or 0.0),
        "reason": j.get("reason", ""),
        "evidence_quotes": j.get("evidence_quotes") or [],
        "draft_entry": j.get("draft_entry"),
    }


def make_investigate(cfg: config.RunConfig, llm: LLM):
    def investigate(state: DiscoveryState) -> DiscoveryState:
        ledger = dict(state.get("ledger", {}))
        verdicts = []
        for c in state.get("candidates", []):
            print(f"[investigate] {c['domain']} ...")
            v = _investigate_one(c, cfg, llm)
            verdicts.append(v)
            ledger[v["domain"]] = {
                "verdict": v["decision"],
                "date": tools.today_iso(),
                "reason": (v.get("reason") or "")[:200],
            }
            time.sleep(1.0)  # be gentle on hosts + APIs
        return {"verdicts": verdicts, "ledger": ledger}
    return investigate


# ── select ───────────────────────────────────────────────────────────────────
def make_select(cfg: config.RunConfig):
    def select(state: DiscoveryState) -> DiscoveryState:
        accepts = [
            v for v in state.get("verdicts", [])
            if v.get("decision") == "accept"
            and v.get("confidence", 0) >= cfg.confidence_threshold
            and v.get("draft_entry")
        ]
        accepts.sort(key=lambda v: v.get("confidence", 0), reverse=True)
        accepts = accepts[: cfg.max_entries]

        drafts = []
        for v in accepts:
            e = v["draft_entry"]
            causes = [c for c in (e.get("cause") or []) if c in TAXONOMY]
            drafts.append({
                "id": tools.slugify(e.get("name", ""), e.get("city", "")),
                "name": e.get("name"),
                "city": e.get("city"),
                "state": e.get("state", "TX"),
                "cause": causes,
                "volunteer_url": v.get("volunteer_url"),
                "fallback_urls": [],
                "notes": e.get("notes", ""),
                "active": True,
            })
        print(f"[select] {len(drafts)} entry/ies proposed")
        return {"drafts": drafts}
    return select


# ── finalize (report in dry-run, PR when live) ───────────────────────────────
def make_finalize(cfg: config.RunConfig):
    def finalize(state: DiscoveryState) -> DiscoveryState:
        from . import report as report_mod
        verdicts = state.get("verdicts", [])
        drafts = state.get("drafts", [])

        if cfg.dry_run:
            config.REPORT_DIR.mkdir(parents=True, exist_ok=True)
            path = config.REPORT_DIR / f"discovery-{tools.today_iso()}.md"
            path.write_text(report_mod.render_report(verdicts), encoding="utf-8")
            print(f"[finalize] dry-run report -> {path}")
            return {"output_ref": str(path)}

        if not drafts:
            print("[finalize] no accepts — nothing to open a PR for")
            return {"output_ref": None}

        accepted = [v for v in verdicts if v.get("decision") == "accept"
                    and v.get("draft_entry")][: cfg.max_entries]
        branch = f"{cfg.branch_prefix}/{time.strftime('%Y-%m')}"
        url = tools.open_pr(drafts, state.get("ledger", {}),
                            report_mod.render_pr_body(accepted), branch)
        print(f"[finalize] PR opened -> {url}")
        return {"output_ref": url}
    return finalize


# ── assembly ─────────────────────────────────────────────────────────────────
def build_graph(cfg: config.RunConfig, llm: LLM):
    g = StateGraph(DiscoveryState)
    g.add_node("plan_queries", make_plan_queries(cfg))
    g.add_node("search", make_search(cfg))
    g.add_node("triage", make_triage(cfg))
    g.add_node("investigate", make_investigate(cfg, llm))
    g.add_node("select", make_select(cfg))
    g.add_node("finalize", make_finalize(cfg))

    g.add_edge(START, "plan_queries")
    g.add_edge("plan_queries", "search")
    g.add_edge("search", "triage")
    g.add_edge("triage", "investigate")
    g.add_edge("investigate", "select")
    g.add_edge("select", "finalize")
    g.add_edge("finalize", END)
    return g.compile()
