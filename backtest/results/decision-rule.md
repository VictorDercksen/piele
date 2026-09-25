# Decision rule

Status: proposed on 25 September 2026, to be confirmed before the first Jev run. Once Jev has been called, this rule is not changed for that run.

The Machine uses Jev for its picks if, over the reported seasons (2022/23 to 2025/26 combined), Jev's **anonymised** arm beats the **Elo** baseline on both:

1. Superbru points per match (win and margin points, `app/agent/scoring.py`), and
2. mean ranked probability score on the 13 result bands (lower is better).

`score.py` reports the verdict with 95% intervals from resampling whole rounds. An interval that includes zero is reported as such; the rule is decided on the point estimates, and a narrow win is described as narrow.

Until the rule is met, Jev's probabilities stay hidden before kickoff (plan decision O1). The named arm is reported beside it; a large gap between the arms points to recall of these seasons rather than prediction. Whatever the result, the clean test is the 2026/27 season scored as it happens.
