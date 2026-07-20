"""Short-term memory: a LangGraph SQLite checkpointer (tech plan §5).

Checkpoints land at node boundaries, so this buys within-run resume — if a
node *after* the expensive `investigate` step fails, a resume replays from the
saved post-investigate state instead of re-fetching and re-paying. Candidate-
level "never re-investigate the same domain" is the ledger's job (see tools.py),
not the checkpointer's.

The store is a local SQLite file, keyed by a per-run thread_id. Enough for a
single monthly job; nothing external to stand up.
"""

from __future__ import annotations

import contextlib

from . import config


@contextlib.contextmanager
def checkpointer_for(cfg: config.RunConfig):
    """Yield a compiled-graph checkpointer, or None when disabled.

    Used as a context manager because SqliteSaver owns a db connection that must
    stay open across compile + invoke.
    """
    if not cfg.checkpoint:
        yield None
        return

    from langgraph.checkpoint.sqlite import SqliteSaver

    config.CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SqliteSaver.from_conn_string(str(config.CHECKPOINT_PATH)) as saver:
        yield saver
