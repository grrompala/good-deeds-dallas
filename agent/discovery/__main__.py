"""CLI entry point. Run from the repo root so root-level scraper modules import:

    python -m agent.discovery --dry-run --domains theseniorsource.org volunteermatch.org
    python -m agent.discovery --dry-run --limit 5        # live search, dry output
    python -m agent.discovery                            # live: opens a PR

Session-1 smoke test (tech plan §10): seed three hand-picked domains — one
known-good local org, one national/aggregator, one already-covered — and check
the three verdicts in the dry-run report.
"""

from __future__ import annotations

import argparse

from . import config
from .graph import build_graph
from .llm import LLM
from .state import DiscoveryState


def main() -> None:
    ap = argparse.ArgumentParser(prog="agent.discovery")
    ap.add_argument("--dry-run", action="store_true",
                    help="write a markdown report instead of opening a PR")
    ap.add_argument("--live", action="store_true",
                    help="open a PR (overrides --dry-run). Default is dry-run.")
    ap.add_argument("--domains", nargs="*", default=None,
                    help="hand-picked domains to investigate directly (skips search)")
    ap.add_argument("--limit", type=int, default=None,
                    help="cap candidates investigated this run")
    ap.add_argument("--provider", choices=["openai", "anthropic"], default=None,
                    help="LLM provider (default: auto-detect / DISCOVERY_PROVIDER)")
    ap.add_argument("--compile-only", action="store_true",
                    help="build the graph and exit (offline wiring check, no LLM/network)")
    args = ap.parse_args()

    cfg = config.RunConfig(dry_run=not args.live, provider=args.provider)
    if args.domains:
        cfg.seed_domains = args.domains
    if args.limit is not None:
        cfg.max_candidates = args.limit

    if args.compile_only:
        # Offline check: graph assembles and coverage loads, no keys/network/spend.
        from . import tools
        names, domains = tools.load_coverage()
        build_graph(cfg, llm=None)  # nodes are closures; compile doesn't call the LLM
        print(f"OK: graph compiled; coverage loaded "
              f"({len(names)} names, {len(domains)} domains).")
        return

    llm = LLM.build(cfg.provider, cfg.mini_model, cfg.full_model)
    graph = build_graph(cfg, llm)
    print(f"Running discovery ({'DRY-RUN' if cfg.dry_run else 'LIVE'}) "
          f"provider={llm.provider} mini={llm.mini_model} full={llm.full_model}")

    final: DiscoveryState = graph.invoke({})
    print("\n=== done ===")
    print(f"candidates investigated : {len(final.get('verdicts', []))}")
    print(f"entries proposed        : {len(final.get('drafts', []))}")
    print(f"output                  : {final.get('output_ref')}")


if __name__ == "__main__":
    main()
