"""THE SERIES ENGINE: this run against your previous run on the same project.

A card that describes one sitting is a log entry. The loop that makes it Strava is progression,
and the honest unit of progression is the same project, run after run: did verified-per-turn go
up or down since the last time you sat down in this repository? Two readings give a verdict;
one reading is a baseline, never a trend.

Lifted from MAGNET (`magnet/reporter.py`, `magnet/log.py`; same author, MIT, disclosed in the
README), which ported the verdict rule from mountain-of-helicon. What changed: MAGNET's series
is a probe measured weekly; here a reading is one grind's five numbers, keyed by project and the
sitting's start time, recorded locally when the card is drawn. Nothing here leaves the machine.

  log.py       the SQLite record at ~/.agentgrinder/series.db: readings and predictions
  reporter.py  verdict over a series (baseline under two measured readings), the card line
"""
