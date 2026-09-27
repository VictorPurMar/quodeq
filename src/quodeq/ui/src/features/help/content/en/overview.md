## Overview

The **Overview** tab is a project's landing page: the accumulated quality picture plus the fastest routes into the details.

### Accumulated scores

Overview shows the latest scored result for each dimension, even when those results come from different runs. Evaluate security today and maintainability tomorrow; both appear side by side, each card labeled with the run that produced it. To inspect a single run instead, open it from *History*.

### Header stats

- **Score** the overall number and grade, with a delta against the previous run.
- **Violations** active findings with severity badges. Click the stat, or a single badge, to open a project-wide findings view filtered to that severity.
- **Compliance** evidence of good practice. Click it to browse the compliant findings.
- **Ratio** compliance to violations.

### The strip

Under the tiles, one line carries the numbers that only move when the code moves. Each has a "?" that says what it counts, with a link into this help.

- **Criticals** findings of critical severity. Zero is the only good number; the count turns red otherwise.
- **Majors** major findings. Together with criticals they are the blocking findings; the small badge next to the number is their change since the baseline run, and down is good.
- **Open types** distinct requirement codes with at least one open finding, with how many types closed since the baseline. Fixing every finding of one code closes a type; fixing some of them does not move this number.
- **Density** open findings per 100 files read, over the dimensions shown. When a run recorded no files-read count, the strip says so instead of showing a number.
- **Since baseline** at the right: which run the numbers are compared with, how many files changed in between (or "in all files" when no commit was recorded), and the new and resolved findings in that scope. **see findings** opens them. The strip names no requirement codes; the Violations tab's by-type view lists them.

### Panels

- **Score history** runs over time, groupable by day, week, or month. See *History & Trends*.
- **Dimension scores** one bar per dimension. Click a bar to open that dimension in the Explorer.
- **Dimension cards** a gauge per dimension with principle detail. Click a card to open the Explorer anchored to the run behind the score.
- **Violations by file** the worst files, sorted by severity. Click a row to open the file detail.

### The report

The **Report** button in the top bar renders the whole overview as a Markdown report in the side pane, ready to download and share outside Quodeq. The report follows the header: the four tiles (score, violations, compliance, ratio), then the strip's numbers (criticals, majors, open types, density), then one since-baseline section with counts only. The raw violations total stays in its summary at the end.
