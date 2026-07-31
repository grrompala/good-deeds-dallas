"""Scrape-pending page (Streamlit multipage — appears in the sidebar nav).

    streamlit run agent/dashboard/Discover_orgs.py   → then pick "Scrape pending"

orgs.json is only the input list: an org merged by a discovery PR stays invisible
on the site until fetch_curated scrapes it into volops_curated.json. This page
shows those pending orgs, fetches their listings on demand, lets you review and
exclude any before shipping, then opens a PR for the raw scrape — mirroring the
Discover-orgs page's review → PR flow.

Deliberately stops there: QC (dedup/expiry/content-judge), tagging, and Smart
Search embedding are all left to the next scheduled weekly refresh — both are
fully incremental (qc_filter.py skips anything already qc-stamped;
classify_listings.py skips anything already tagged), so whatever ships here
just gets picked up automatically, same as every other source. The only human
judgment call this page is for is "does this listing belong on the site at
all" — everything downstream of that is trusted to the existing pipeline.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# This file is agent/dashboard/pages/<this>.py → repo root is 3 levels up.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from agent.dashboard import auth, session  # noqa: E402

st.set_page_config(page_title="Scrape pending", page_icon="🧭", layout="wide")
auth.require_password()  # gate + secrets bootstrap — see agent/dashboard/auth.py


def _when_label(r: dict) -> str:
    e = r.get("expiry") or {}
    kind, ends = e.get("kind"), e.get("ends_on")
    if kind == "one_time":
        return f"event · {ends}" if ends else "event"
    if kind == "ongoing":
        return f"ongoing · thru {ends}" if ends else "ongoing"
    return kind or "—"


def _review_row(r: dict) -> dict:
    # Curated records use "location" (fetch_curated.py backfills city from the
    # org's own known city in orgs.json when the page didn't state one) — NOT
    # "address", which is the other fetchers' key. Reading the wrong key here
    # made city show blank in this grid even when the data had it right.
    loc = r.get("location") or {}
    return {
        "include": True,
        "id": r.get("id") or "",
        "org": r.get("org_name") or "",
        "title": r.get("opportunity_title") or "",
        "city": loc.get("city") or "",
        "when": _when_label(r),
        "description": r.get("description_short") or r.get("description_long") or "",
    }


st.title("🧭 Scrape pending orgs")
st.caption("Orgs merged into orgs.json but not yet scraped onto the site. Scraping "
           "fetches their listings so you can review and exclude any before opening "
           "a PR. QC, tagging, and Smart Search embedding all happen automatically "
           "in the next scheduled weekly refresh — this page is just for the "
           "\"does this belong on the site\" call.")
st.divider()

# ── Completion banner (persists across reruns; celebrates once) ───────────────
done = st.session_state.get("scrape_done")
if done:
    n_orgs = len(done["ids"])
    if done["errors"]:
        st.warning(f"⚠️ Scrape finished with issues — {done['listings']} listing(s) fetched "
                   f"across {n_orgs} org(s). See errors below.")
    else:
        st.success(f"✅ Scrape complete — {done['listings']} listing(s) fetched across "
                   f"{n_orgs} org(s). Review below, then open a PR.")
    if done.pop("fresh", False):        # animate only on the run right after finishing
        st.toast("Scrape complete", icon="✅")
        if not done["errors"]:
            st.balloons()

# ── Pending list + action ────────────────────────────────────────────────────
pending = session.pending_orgs()

if not pending:
    st.info("No orgs are pending a scrape. Newly merged discovery PRs show up here "
            "until their listings are fetched.")
else:
    ids = [o["id"] for o in pending]
    names = {o["id"]: o.get("name", o["id"]) for o in pending}

    st.subheader(f"{len(pending)} org(s) pending")
    st.dataframe(
        pd.DataFrame([{
            "name": o.get("name", ""),
            "city": o.get("city", ""),
            "id": o.get("id", ""),
            "volunteer_url": o.get("volunteer_url", ""),
        } for o in pending]),
        use_container_width=True, hide_index=True,
    )

    if st.button(f"⛏️ Scrape {len(pending)} pending org(s)", type="primary"):
        st.session_state.pop("curated_pr_done", None)  # starting a fresh batch to review
        errors: list[str] = []
        with st.status("Fetching listings…", expanded=True) as status:
            prog = st.progress(0.0, "Starting…")

            def cb(i, total, oid):
                prog.progress((i - 1) / total, f"Scraping {i}/{total}: {names.get(oid, oid)}")

            results = session.scrape_org_ids(ids, on_progress=cb)
            prog.progress(1.0, "Fetched")
            for r in results:
                if not r["ok"]:
                    errors.append(f"Fetch failed for {names.get(r['id'], r['id'])}:\n{r['output'][-500:]}")
            status.update(label="Done with issues" if errors else "Done",
                          state="error" if errors else "complete", expanded=False)

        y = session.curated_yield(ids)
        st.session_state.scrape_done = {
            "ids": ids,
            "names": names,
            "listings": sum(v["listings"] for v in y.values()),
            "errors": errors,
            "fresh": True,
        }
        st.rerun()

# ── Review + Open PR (shown until this batch is PR'd) ─────────────────────────
if done:
    for e in done["errors"]:
        st.error(e)

    # Per-org yield — so an org that came back with 0 listings is visible rather
    # than silently absent from the flat review grid below. A 0 here isn't always
    # "no opportunities": a fetch failure (see errors above) or an
    # opportunity-rich page truncated by the LLM output cap can also produce it.
    y = session.curated_yield(done["ids"])
    st.dataframe(
        pd.DataFrame([{
            "org": done["names"].get(oid, oid),
            "listings": y[oid]["listings"],
            "excluded": y[oid]["excluded"],
        } for oid in done["ids"]]),
        use_container_width=True, hide_index=True,
    )
    zero_orgs = [done["names"].get(oid, oid) for oid in done["ids"] if y[oid]["listings"] == 0]
    if zero_orgs:
        st.warning("⚠️ 0 listings extracted for: **" + "**, **".join(zero_orgs) + "**. "
                   "Either the page has no discrete opportunities, the fetch failed "
                   "(see any errors above), or it's the wrong page for that org. "
                   "The org is still marked scraped, so it won't be retried automatically.")

    pr_done = st.session_state.get("curated_pr_done")

    if pr_done and pr_done.get("ids") == done["ids"]:
        # Already shipped this exact batch — show the result, not the review grid.
        if pr_done.get("via") == "gh":
            st.success(f"PR opened: {pr_done['url']}")
        elif pr_done.get("url"):
            st.success(f"Pushed **{pr_done['branch']}**. Open the PR: {pr_done['url']}")
        else:
            st.info(f"Pushed **{pr_done['branch']}** — open a PR on GitHub for it.")
        if st.button("Start a new batch"):
            st.session_state.pop("scrape_done", None)
            st.session_state.pop("curated_pr_done", None)
            st.rerun()
    else:
        st.divider()
        records = session.curated_records(done["ids"])
        st.subheader(f"Review — {len(records)} listing(s)")
        if records:
            st.caption("Uncheck **include** to drop a listing (marked inactive, never deleted — "
                       "won't show on the site or get QC'd). Everything else ships as-is; QC, "
                       "tags, and embedding follow in the next weekly refresh.")
            df = pd.DataFrame([_review_row(r) for r in records])
            edited = st.data_editor(
                df, use_container_width=True, hide_index=True, height=420,
                column_config={
                    "include": st.column_config.CheckboxColumn("include", width="small"),
                    "id": None,  # hidden — needed for exclusion, not for review
                    "description": st.column_config.TextColumn("description", width="large"),
                },
                disabled=["org", "title", "city", "when", "description"],
            )
            rows = edited.to_dict("records")
            included = sum(1 for r in rows if r["include"])
            excluded_count = len(rows) - included

            # Deliberately NOT disabled at 0 included: excluding everything is a
            # valid, meaningful review outcome (e.g. the org's page turned out to
            # be a misattributed aggregator dump) — the PR still needs to ship so
            # the ledger stamp merges to main and the org stops showing as
            # pending / won't be re-scraped by the next weekly refresh.
            suffix = f", {excluded_count} excluded" if excluded_count else ""
            label = f"🔀 Open PR ({included} live{suffix})"
            if st.button(label, type="primary"):
                try:
                    excluded_ids = [r["id"] for r in rows if not r["include"]]
                    with st.spinner("Branch, commit, push…"):
                        session.exclude_curated_records(excluded_ids)
                        res = session.open_curated_pr(done["ids"], done["names"])
                    st.session_state.curated_pr_done = {**res, "ids": done["ids"]}
                    st.rerun()
                except Exception as e:
                    st.error(f"PR failed: {e}")
        else:
            st.caption("No listings were extracted (the org's page may be prose rather than "
                       "discrete opportunities — it's still marked scraped so it won't re-run). "
                       "Nothing to open a PR for.")
