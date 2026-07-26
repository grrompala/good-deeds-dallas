"""Scrape-pending page (Streamlit multipage — appears in the sidebar nav).

    streamlit run agent/dashboard/Discover_orgs.py   → then pick "Scrape pending"

orgs.json is only the input list: an org merged by a discovery PR stays invisible
on the site until fetch_curated scrapes it into volops_curated.json and QC/tags
run. This page shows those pending orgs, runs that curated sub-pipeline
(fetch → QC → tags) on demand, and previews the resulting listings. Smart Search
embedding is left to the weekly refresh. Thin UI over agent/dashboard/session.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# This file is agent/dashboard/pages/<this>.py → repo root is 3 levels up.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from agent.dashboard import session  # noqa: E402

st.set_page_config(page_title="Scrape pending", page_icon="🧭", layout="wide")


def _when_label(r: dict) -> str:
    e = r.get("expiry") or {}
    kind, ends = e.get("kind"), e.get("ends_on")
    if kind == "one_time":
        return f"event · {ends}" if ends else "event"
    if kind == "ongoing":
        return f"ongoing · thru {ends}" if ends else "ongoing"
    return kind or "—"


def _preview_row(r: dict) -> dict:
    addr = r.get("address") or {}
    return {
        "org": r.get("org_name") or "",
        "title": r.get("opportunity_title") or "",
        "city": addr.get("city") or r.get("city") or "",
        "when": _when_label(r),
        "tags": ", ".join(r.get("unified_tags") or r.get("cause_tags") or []),
        "QC": (r.get("qc") or {}).get("status") or "—",
    }


st.title("🧭 Scrape pending orgs")
st.caption("Orgs merged into orgs.json but not yet scraped onto the site. Scraping "
           "fetches their listings, quality-checks them, and adds tags — making them "
           "live on the main site. (Smart Search embedding runs in the weekly refresh.)")
st.divider()

# ── Completion banner (persists across reruns; celebrates once) ───────────────
done = st.session_state.get("scrape_done")
if done:
    n_orgs = len(done["ids"])
    rej = f", {done['rejected']} rejected by QC" if done["rejected"] else ""
    if done["errors"]:
        st.warning(f"⚠️ Scrape finished with issues — {done['listings']} listing(s) added "
                   f"across {n_orgs} org(s){rej}. See errors below.")
    else:
        st.success(f"✅ Scrape complete — {done['listings']} listing(s) added across "
                   f"{n_orgs} org(s){rej}.")
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
        errors: list[str] = []
        with st.status("Running curated pipeline…", expanded=True) as status:
            st.write("**1/3 · Fetching listings**")
            prog = st.progress(0.0, "Starting…")

            def cb(i, total, oid):
                prog.progress((i - 1) / total, f"Scraping {i}/{total}: {names.get(oid, oid)}")

            results = session.scrape_org_ids(ids, on_progress=cb)
            prog.progress(1.0, "Fetched")
            for r in results:
                if not r["ok"]:
                    errors.append(f"Fetch failed for {names.get(r['id'], r['id'])}:\n{r['output'][-500:]}")

            st.write("**2/3 · Quality check**")
            ok_qc, out_qc = session.run_curated_qc()
            if not ok_qc:
                errors.append(f"QC failed:\n{out_qc[-500:]}")

            st.write("**3/3 · Tagging**")
            ok_tags, out_tags = session.run_curated_tags()
            if not ok_tags:
                errors.append(f"Tagging failed:\n{out_tags[-500:]}")

            status.update(label="Done with issues" if errors else "Done",
                          state="error" if errors else "complete", expanded=False)

        y = session.curated_yield(ids)
        st.session_state.scrape_done = {
            "ids": ids,
            "listings": sum(v["listings"] for v in y.values()),
            "rejected": sum(v["rejected"] for v in y.values()),
            "errors": errors,
            "fresh": True,
        }
        # Rerun so the pending list refreshes and the persistent banner/preview
        # render from session_state (works the same on success or with errors).
        st.rerun()

# ── Result: errors + per-org yield + a preview of the actual listings ─────────
if done:
    for e in done["errors"]:
        st.error(e)

    st.divider()
    st.subheader("Last scrape result")
    y = session.curated_yield(done["ids"])
    st.dataframe(
        pd.DataFrame([{
            "org id": oid,
            "listings": y[oid]["listings"],
            "rejected (QC)": y[oid]["rejected"],
        } for oid in done["ids"]]),
        use_container_width=True, hide_index=True,
    )

    records = session.curated_records(done["ids"])
    st.markdown(f"**Preview — {len(records)} listing(s)**")
    if records:
        st.dataframe(pd.DataFrame([_preview_row(r) for r in records]),
                     use_container_width=True, hide_index=True)
        with st.expander("Full descriptions"):
            for r in records:
                title = r.get("opportunity_title") or "(untitled)"
                url = r.get("source_url") or ""
                st.markdown(f"**{title}** — {r.get('org_name','')}"
                            + (f"  ·  [source]({url})" if url else ""))
                desc = r.get("description_long") or r.get("description_short") or "_(no description)_"
                st.caption(desc)
                st.divider()
    else:
        st.caption("No listings were extracted (the org's page may be prose rather than "
                   "discrete opportunities — it's still marked scraped so it won't re-run).")

    st.info("Changes are uncommitted in your working tree — review the diff and commit "
            "to deploy. Smart Search embedding runs in the weekly refresh.")
