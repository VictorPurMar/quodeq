## Grade Formula

The grade formula turns findings into scores and letter grades. You can tune every part of it: open **Settings**, find the *Grade formula* section, and press **open editor**. Changes preview live before anything is saved.

```figure
component: image
caption: The Grade Formula editor. Parameter tabs on top, live preview strip below.
alt: Grade Formula editor showing the preview strip with per-dimension gauges, the severity weight sliders, and the APPLY and RESET buttons
srcDark: @gradeFormulaDark
srcLight: @gradeFormulaLight
```

### The four tabs

| Key | Value |
| --- | --- |
| SEVERITY | Weight sliders for critical, major, and minor violation types. A type is one requirement code per principle and severity, not one finding; the model's own type tag only groups findings that carry no requirement code. A readout shows how much a critical finding currently weighs relative to a minor one. |
| CURVE | Shape controls for the scoring curve: strictness K (how fast violations hurt), lift compress (how much compliance evidence can lift), and ceiling scale (the maximum score under violation load). |
| BOUNDARIES | Drag the dividers (or focus one and use the arrow keys) between CRITICAL, POOR, ADEQUATE, GOOD, and EXEMPLARY to move the grade thresholds. Severity floors below set the worst score possible when no critical findings exist. |
| DIMENSIONS | Optional per-dimension weights. When the toggle is off, the overall grade is a plain mean across dimensions. |

```figure
component: GradeFormulaCurveFigure
caption: Default severity weights set how hard each finding pushes a score down the curve. Solid line is the base score, dashed is the ceiling.
```

### Preview, then apply

The preview strip recomputes your selected project's latest run with the draft parameters and shows before and after, per dimension. Nothing is stored until you press **APPLY**, which saves the formula and rescores every run in every project. **RESET Q²** returns to the built-in defaults, also rescoring everything.

> **Where you see the effect**
>
> Rescoring updates run detail pages, the accumulated overview, trend charts, and project cards. The grade labels from the BOUNDARIES tab drive every gauge and badge in the app.

### Every parameter

| Key | Value |
| --- | --- |
| Severity weights | How much one type of each severity counts toward the weighted type count. Defaults 4.0 critical, 1.5 major, 0.25 minor; range 0.05 to 10. Moves stage 1 and everything after it. |
| Strictness K | How fast the base score falls as weighted types grow. Default 0.12; range 0.01 to 1. Higher is harsher. Moves stage 2. |
| Lift compress | How much compliance evidence can lift the base. Default 1.8; range 1 to 4. Higher means compliance lifts less. Moves stage 3. |
| Ceiling scale | How fast the maximum score falls with the log of the weighted type count. Default 0.5; range 0 to 2. Zero removes the ceiling. Moves stage 4. |
| Severity floors | The lowest score possible when the worst finding is minor (default 8.0) or major (default 5.0). A critical finding always floors at 0. Minor must stay at or above major. Moves stage 4. |
| Grade thresholds | Where Exemplary, Good, Adequate and Poor start on the 0 to 10 scale. Defaults 9, 7, 5, 3; strictly decreasing. Changes the label, never the number. |
| Dimension weights | Per-dimension multipliers for the project score, range 0.1 to 3, on when the toggle is on. Changes the project score only. |

Three more arrive as the scoring converges: the grouping key (what counts as one type), a volume term (whether many findings of one type weigh more than one), and an advisory weight (how much advisory findings count). Each gets a row here when it lands.

The *Why This Grade* page shows these stages on a principle of your own run.

The formula never touches the insufficient-evidence gate. Principles with too little evidence stay Insufficient regardless of your settings.
