"""Scrape-pending page (Streamlit multipage — appears in the sidebar nav).

    streamlit run agent/dashboard/app.py   → then pick "Scrape pending"

orgs.json is only the input list: an org merged by a discovery PR stays invisible
on the site until fetch_curated scrapes it into volops_curated.json and QC/tags
run. This page shows those pending orgs and runs that curated sub-pipeline
(fetch → QC → tags) on demand. Smart Search embedding is left to the weekly
refresh. Thin UI over agent/dashboard/session.py.
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

st.title("🧭 Scrape pending orgs")
st.caption("Orgs merged into orgs.json but not yet scraped onto the site. Scraping "
           "fetches their listings, quality-checks them, and adds tags — making them "
           "live on the main site. (Smart Search embedding runs in the weekly refresh.)")
st.divider()

pending = session.pending_orgs()

if not pending:
    st.success("✅ All caught up — no orgs pending a scrape.")
    st.caption("Newly merged discovery PRs show up here until their listings are fetched.")
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
        failed = []
        errors = []
        with st.status("Running curated pipeline…", expanded=True) as status:
            st.write("**1/3 · Fetching listings**")
            prog = st.progress(0.0, "Starting…")

            def cb(i, total, oid):
                prog.progress((i - 1) / total, f"Scraping {i}/{total}: {names.get(oid, oid)}")

            results = session.scrape_org_ids(ids, on_progress=cb)
            prog.progress(1.0, "Fetched")
            failed = [r for r in results if not r["ok"]]
            for r in failed:
                st.error(f"Fetch failed for {names.get(r['id'], r['id'])}:\n{r['output'][-800:]}")

            st.write("**2/3 · Quality check**")
            ok_qc, out_qc = session.run_curated_qc()
            if not ok_qc:
                errors.append("QC")
                st.error(f"QC failed:\n{out_qc[-800:]}")

            st.write("**3/3 · Tagging**")
            ok_tags, out_tags = session.run_curated_tags()
            if not ok_tags:
                errors.append("tagging")
                st.error(f"Tagging failed:\n{out_tags[-800:]}")

            bad = failed or errors
            status.update(label="Done with errors" if bad else "Done",
                          state="error" if bad else "complete", expanded=False)

        # Persist a summary so it survives the rerun below.
        y = session.curated_yield(ids)
        st.session_state.scrape_summary = pd.DataFrame([{
            "org": names.get(oid, oid),
            "listings": y[oid]["listings"],
            "rejected (QC)": y[oid]["rejected"],
        } for oid in ids])

        # On a clean run, rerun so the pending table refreshes (scraped orgs drop
        # off). On errors, stay put so the messages above remain visible.
        if not (failed or errors):
            st.rerun()

summary = st.session_state.get("scrape_summary")
if summary is not None:
    st.divider()
    st.subheader("Last scrape result")
    st.dataframe(summary, use_container_width=True, hide_index=True)
    st.info("Changes are uncommitted in your working tree — review the diff and commit "
            "to deploy. Smart Search embedding runs in the weekly refresh.")
