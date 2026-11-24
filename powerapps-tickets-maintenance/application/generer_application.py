"""Génère les écrans YAML (pa.yaml v3) du template moderne Tickets de maintenance."""
import sys
import yaml

OUT = sys.argv[1]

NAVY = '"#001E62"'
BG = 'ColorValue("#F5F6F8")'
WHITE = 'ColorValue("#FFFFFF")'
BORDER = 'ColorValue("#E6E8EB")'
TXT = 'ColorValue("#1B1B1F")'
TXT2 = 'ColorValue("#5C5C66")'
TXT3 = 'ColorValue("#8A8A94")'
TRANSP = 'RGBA(0, 0, 0, 0)'
LIST = "'Ticket dépannage'"

CONTAINER = "GroupContainer@1.5.0"
LABEL = "Label@2.5.1"
BUTTON = "Classic/Button@2.2.0"
RECT = "Rectangle@2.3.0"
IMAGE = "Image@2.2.3"
HTML = "HtmlViewer@2.1.0"
GALLERY = "Gallery@2.15.0"
COMBO = "ModernCombobox@1.1.1"
TEXTINPUT = "Classic/TextInput"


class Block(str):
    pass


def _repr_str(dumper, data):
    style = "|" if ("\n" in data or ": " in data or " #" in data or data.endswith(":")) else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


yaml.add_representer(Block, _repr_str)
yaml.add_representer(str, _repr_str)


def f(expr):
    """Formule Power Fx (préfixe =)."""
    return "=" + expr


def ctrl(name, control, props, children=None, variant=None):
    body = {"Control": control}
    if variant:
        body["Variant"] = variant
    body["Properties"] = {k: (v if isinstance(v, str) and v.startswith("=") else f(str(v)))
                          for k, v in props.items()}
    if children:
        body["Children"] = children
    return {name: body}


def radius(r):
    return {"RadiusTopLeft": r, "RadiusTopRight": r, "RadiusBottomLeft": r, "RadiusBottomRight": r}


def nopad():
    return {"PaddingTop": 0, "PaddingBottom": 0, "PaddingLeft": 0, "PaddingRight": 0}


def label(name, text, **p):
    props = {"Text": text, "Font": "Font.'Segoe UI'", **nopad()}
    props.update(p)
    return ctrl(name, LABEL, props)


def auto(name, direction, children, **p):
    props = {"LayoutDirection": f"LayoutDirection.{direction}", "DropShadow": "DropShadow.None",
             "LayoutMinHeight": 0, "LayoutMinWidth": 0}
    props.update(p)
    return ctrl(name, CONTAINER, props, children, variant="AutoLayout")


def manual(name, children, **p):
    props = {"DropShadow": "DropShadow.None"}
    props.update(p)
    return ctrl(name, CONTAINER, props, children, variant="ManualLayout")


def overlay_button(name, onselect, r=12, hover="RGBA(0, 0, 0, 0.03)", **p):
    props = {
        "Text": '""', "Fill": TRANSP, "Color": TRANSP, "BorderColor": TRANSP,
        "BorderStyle": "BorderStyle.None", "HoverFill": hover, "HoverColor": TRANSP,
        "HoverBorderColor": TRANSP, "PressedFill": "RGBA(0, 0, 0, 0.06)", "PressedColor": TRANSP,
        "PressedBorderColor": TRANSP, "X": 0, "Y": 0, "Width": "Parent.Width",
        "Height": "Parent.Height", "OnSelect": onselect, **radius(r),
    }
    props.update(p)
    return ctrl(name, BUTTON, props)


def button(name, text, onselect, width, primary=False, **p):
    props = {
        "Text": f'"{text}"', "Width": width, "Height": 36, "LayoutMinWidth": width,
        "Size": 12, "FontWeight": "FontWeight.Semibold", "OnSelect": onselect,
        "BorderStyle": "BorderStyle.Solid", "BorderThickness": 1, **radius(8),
    }
    if primary:
        props.update({"Fill": f"ColorValue({NAVY})", "Color": "ColorValue(\"#FFFFFF\")",
                      "BorderColor": f"ColorValue({NAVY})", "HoverFill": 'ColorValue("#0B2E7A")',
                      "HoverColor": 'ColorValue("#FFFFFF")', "HoverBorderColor": 'ColorValue("#0B2E7A")',
                      "PressedFill": 'ColorValue("#00164A")'})
    else:
        props.update({"Fill": WHITE, "Color": f"ColorValue({NAVY})", "BorderColor": 'ColorValue("#D1D5DB")',
                      "HoverFill": 'ColorValue("#F3F5F9")', "HoverColor": f"ColorValue({NAVY})",
                      "HoverBorderColor": f"ColorValue({NAVY})", "PressedFill": 'ColorValue("#E8EDF7")'})
    props.update(p)
    return ctrl(name, BUTTON, props)



# ======================================================================
#  APPLICATION « GESTION DES TICKETS DE MAINTENANCE »
#  4 écrans : scrAccueil, scrListe, scrCreer, scrDetail
# ======================================================================
PH = "App.Width < 700"           # téléphone
TAB = "App.Width < 1100"         # tablette : barre latérale réduite
WIDE = "App.Width >= 1200"       # grand écran : toutes les colonnes
COMBO_CLASSIC = "Classic/ComboBox"
NAVY_C = f"ColorValue({NAVY})"

GRIS, ORANGE, VERT, ROUGE, BLEU_CLAIR = "#8A8F98", "#F7A600", "#107C10", "#D13438", "#5B9BD5"


def ph(a, b):
    return f"If({PH}, {a}, {b})"


def code(text, **subs):
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", v)
    return Block(text)


CARD = dict(Fill=WHITE, BorderColor=BORDER, BorderThickness=1, **radius(12))
PAD = lambda n: dict(PaddingTop=n, PaddingBottom=n, PaddingLeft=n, PaddingRight=n)  # noqa: E731

# ---------------------------------------------------------------- statut / priorité
# Statut (colonne « Ticket clôturer ») : Non / En cours / Oui   -> Non démarré / En cours / Clôturé
# Priorité (colonne « Statut Urgence ») : High - … / Medium - … / Low - …  -> Haute / Moyenne / Basse


def st_lbl(it):
    return f'Switch({it}\'Ticket clôturer\'.Value, "Oui", "Clôturé", "En cours", "En cours", "Non démarré")'


def st_fg(it):
    return f'ColorValue(Switch({it}\'Ticket clôturer\'.Value, "Oui", "#0E700E", "En cours", "#8A5A00", "#4B5059"))'


def st_bg(it):
    return f'ColorValue(Switch({it}\'Ticket clôturer\'.Value, "Oui", "#DFF6DD", "En cours", "#FFF1D6", "#EDEEF0"))'


def pr_key(it):
    return f"First(Split(Coalesce({it}'Statut Urgence'.Value, \"\"), \" \")).Value"


def pr_lbl(it):
    return f'Switch({pr_key(it)}, "High", "Haute", "Medium", "Moyenne", "Low", "Basse", "—")'


def pr_fg(it):
    return f'ColorValue(Switch({pr_key(it)}, "High", "#A4262C", "Medium", "#8A5A00", "Low", "#0E700E", "#4B5059"))'


def pr_bg(it):
    return f'ColorValue(Switch({pr_key(it)}, "High", "#FDE7E9", "Medium", "#FFF1D6", "Low", "#DFF6DD", "#EDEEF0"))'


def pr_bar(it):
    return f'ColorValue(Switch({pr_key(it)}, "High", "{ROUGE}", "Medium", "{ORANGE}", "Low", "#13A10E", "#C8CCD2"))'


def pr_rank(it=""):
    return f'Switch({pr_key(it)}, "High", 1, "Medium", 2, "Low", 3, 4)'


def titre(it):
    return f'Coalesce({it}Title, {it}Description, "Ticket sans description")'


def badge(name, text, fill, color, width, **p):
    return manual(name, [
        label(f"{name}Txt", text, X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Size=11,
              FontWeight="FontWeight.Semibold", Color=color, Align="Align.Center",
              VerticalAlign="VerticalAlign.Middle"),
    ], Width=width, Height=24, LayoutMinWidth=width, Fill=fill, **radius(12), **p)


MOI = ('{Claims: "i:0#.f|membership|" & Lower(User().Email), DisplayName: User().FullName, '
       'Email: User().Email, Department: "", JobTitle: "", Picture: ""}')

# ---------------------------------------------------------------- navigation
NAV = [
    ("Accueil", "Tableau de bord", "📊", "Navigate(scrAccueil, ScreenTransition.Fade)"),
    ("Tickets", "Tickets", "📋", "Navigate(scrListe, ScreenTransition.Fade)"),
    ("Créer", "Nouveau ticket", "➕", "NewForm(Form1);\nNavigate(scrCreer, ScreenTransition.Fade)"),
]


def nav_button(name, txt, onselect, active, **p):
    props = {
        "Text": txt, "Height": 44, "Size": 12, "FontWeight": "FontWeight.Semibold",
        "Fill": "RGBA(255, 255, 255, 0.14)" if active else TRANSP,
        "Color": 'ColorValue("#FFFFFF")' if active else 'ColorValue("#C9D3EA")',
        "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP, "HoverBorderColor": TRANSP,
        "PressedBorderColor": TRANSP, "HoverFill": "RGBA(255, 255, 255, 0.10)",
        "HoverColor": 'ColorValue("#FFFFFF")', "PressedFill": "RGBA(255, 255, 255, 0.18)",
        "PressedColor": 'ColorValue("#FFFFFF")', **radius(8), "OnSelect": "=" + onselect,
        "AlignInContainer": "AlignInContainer.Stretch",
    }
    props.update(p)
    return ctrl(name, BUTTON, props)


def sidebar(p, active):
    kids = [
        label(f"{p}NavLogo", '"ASICS"', Height=40, AlignInContainer="AlignInContainer.Stretch",
              Size=f"If({TAB}, 13, 22)", FontWeight="FontWeight.Bold", Italic="true",
              Color='ColorValue("#FFFFFF")', Align=f"If({TAB}, Align.Center, Align.Left)",
              VerticalAlign="VerticalAlign.Middle", PaddingLeft=f"If({TAB}, 0, 8)"),
        label(f"{p}NavSousTitre", '"Gestion de la maintenance"', Height=20,
              AlignInContainer="AlignInContainer.Stretch", Size=11, Color='ColorValue("#9FB3DE")',
              PaddingLeft=8, Visible=f"!({TAB})", Wrap="false"),
        ctrl(f"{p}NavTrait", RECT, {"Height": 1, "Fill": "RGBA(255, 255, 255, 0.14)",
                                     "AlignInContainer": "AlignInContainer.Stretch"}),
    ]
    for i, (short, long_, ico, nav) in enumerate(NAV):
        kids.append(nav_button(f"{p}Nav{i + 1}", f'If({TAB}, "{ico}", "{ico}   {long_}")', nav, short == active))
    kids += [
        auto(f"{p}NavEspace", "Vertical", None, FillPortions=1, AlignInContainer="AlignInContainer.Stretch"),
        label(f"{p}NavUtilisateur", '"👤  " & User().FullName', Height=36, AlignInContainer="AlignInContainer.Stretch",
              Size=11, Color='ColorValue("#C9D3EA")', Visible=f"!({TAB})", PaddingLeft=8,
              VerticalAlign="VerticalAlign.Middle"),
    ]
    return auto(f"{p}Nav", "Vertical", kids, Width=f"If({TAB}, 76, 232)", LayoutMinWidth=f"If({TAB}, 76, 232)",
                FillPortions=0, AlignInContainer="AlignInContainer.Stretch", Visible=f"!({PH})",
                Fill=NAVY_C, LayoutGap=6, **PAD(12))


def bottom_nav(p, active):
    kids = []
    for i, (short, long_, ico, nav) in enumerate(NAV):
        on = short == active
        kids.append(ctrl(f"{p}Bas{i + 1}", BUTTON, {
            "Text": f'"{ico}" & Char(10) & "{short}"', "FillPortions": 1, "Height": 54, "Size": 10,
            "FontWeight": "FontWeight.Semibold", "Fill": 'ColorValue("#E8EDF7")' if on else TRANSP,
            "Color": NAVY_C if on else TXT2, "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP,
            "HoverBorderColor": TRANSP, "PressedBorderColor": TRANSP, "HoverFill": 'ColorValue("#F0F3F9")',
            "HoverColor": NAVY_C, "PressedFill": 'ColorValue("#E3E9F5")', "PressedColor": NAVY_C,
            **radius(10), "OnSelect": "=" + nav, "AlignInContainer": "AlignInContainer.Center",
        }))
    return auto(f"{p}NavBas", "Horizontal", kids, Height=66, FillPortions=0,
                AlignInContainer="AlignInContainer.Stretch", Visible=PH, Fill=WHITE, BorderColor=BORDER,
                BorderThickness=1, LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=4, **PAD(6))


def page_header(p, title, subtitle, actions):
    return auto(f"{p}EnTete", "Horizontal", [
        auto(f"{p}EnTeteTextes", "Vertical", [
            label(f"{p}Titre", f'"{title}"', Height=32, AlignInContainer="AlignInContainer.Stretch",
                  Size=ph(18, 22), FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
            label(f"{p}SousTitre", subtitle, Height=20, AlignInContainer="AlignInContainer.Stretch", Size=12,
                  Color=TXT2, VerticalAlign="VerticalAlign.Middle", Wrap="false"),
        ], FillPortions=1, AlignInContainer="AlignInContainer.Center", Height=54),
    ] + actions, Height=58, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
        LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=8)


def screen_shell(p, active, content):
    body = auto(f"{p}Corps", "Horizontal", [sidebar(p, active), content], FillPortions=1,
                AlignInContainer="AlignInContainer.Stretch", Fill=BG)
    return auto(f"{p}Racine", "Vertical", [body, bottom_nav(p, active)], X=0, Y=0, Width="Parent.Width",
                Height="Parent.Height", Fill=BG, LayoutGap=0)


def content(p, kids, scroll=False):
    props = dict(FillPortions=1, AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=ph(12, 16),
                 PaddingTop=ph(12, 22), PaddingBottom=ph(12, 22), PaddingLeft=ph(12, 26), PaddingRight=ph(12, 26))
    if scroll:
        props["LayoutOverflowY"] = "LayoutOverflow.Scroll"
    return auto(f"{p}Contenu", "Vertical", kids, **props)


# ---------------------------------------------------------------- cartes KPI
def kpi(p, key, titre_txt, emoji, color, value, selected="false", onselect=None):
    c = f'ColorValue("{color}")'
    kids = [
        manual(f"{p}Kpi{key}Pastille", [
            label(f"{p}Kpi{key}Emoji", f'"{emoji}"', X=0, Y=0, Width=40, Height=40, Size=16,
                  Align="Align.Center", VerticalAlign="VerticalAlign.Middle"),
        ], X=14, Y="(Parent.Height - 40) / 2", Width=40, Height=40, Fill=f"ColorFade({c}, 0.85)", **radius(20)),
        label(f"{p}Kpi{key}Valeur", value, X=64, Y="Parent.Height / 2 - 27", Width="Parent.Width - 70", Height=30,
              Size=21, FontWeight="FontWeight.Bold", Color=c, VerticalAlign="VerticalAlign.Middle"),
        label(f"{p}Kpi{key}Titre", f'"{titre_txt}"', X=64, Y="Parent.Height / 2 + 3", Width="Parent.Width - 70",
              Height=20, Size=12, FontWeight="FontWeight.Semibold", Color=TXT2, Wrap="false",
              VerticalAlign="VerticalAlign.Middle"),
    ]
    if onselect:
        kids.append(overlay_button(f"{p}Kpi{key}Clic", onselect))
    return manual(f"{p}Kpi{key}", kids, FillPortions=ph(0, 1), Width=158, LayoutMinWidth=ph(158, 140),
                  AlignInContainer="AlignInContainer.Stretch",
                  Fill=f"If({selected}, ColorFade({c}, 0.93), {WHITE})",
                  BorderColor=f"If({selected}, {c}, {BORDER})", BorderThickness=f"If({selected}, 2, 1)",
                  **radius(12))


def kpi_row(name, cards):
    return auto(name, "Horizontal", cards, Height=84, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
                LayoutGap=ph(8, 12), LayoutOverflowX="LayoutOverflow.Scroll")


# ======================================================================
#  ÉCRAN 1 – TABLEAU DE BORD (scrAccueil)
# ======================================================================
P = "ac"
LIST_ = LIST

actualiser = code("""=Refresh({{LIST}});
ClearCollect(colTickets, {{LIST}});
Set(varMaj, Now());
Set(varTotal, CountRows(colTickets));
Set(varPrioritaires, CountRows(Filter(colTickets, StartsWith('Statut Urgence'.Value, "High") && 'Ticket clôturer'.Value <> "Oui")));
ClearCollect(
    colStatut,
    {Libelle: "Non démarré", Nombre: CountRows(Filter(colTickets, 'Ticket clôturer'.Value <> "Oui" && 'Ticket clôturer'.Value <> "En cours")), Couleur: "#8A8F98"},
    {Libelle: "En cours", Nombre: CountRows(Filter(colTickets, 'Ticket clôturer'.Value = "En cours")), Couleur: "#F7A600"},
    {Libelle: "Clôturé", Nombre: CountRows(Filter(colTickets, 'Ticket clôturer'.Value = "Oui")), Couleur: "#107C10"}
);
ClearCollect(
    colPriorite,
    {Libelle: "Haute", Nombre: CountRows(Filter(colTickets, StartsWith('Statut Urgence'.Value, "High"))), Couleur: "#D13438"},
    {Libelle: "Moyenne", Nombre: CountRows(Filter(colTickets, StartsWith('Statut Urgence'.Value, "Medium"))), Couleur: "#F7A600"},
    {Libelle: "Basse", Nombre: CountRows(Filter(colTickets, StartsWith('Statut Urgence'.Value, "Low"))), Couleur: "#13A10E"}
);
ClearCollect(
    colDonutStatut,
    ForAll(
        Sequence(CountRows(colStatut)) As i,
        With(
            {r: Index(colStatut, i.Value), t: Max(varTotal, 1)},
            {Couleur: r.Couleur, Pct: r.Nombre / t * 100, Debut: Coalesce(Sum(FirstN(colStatut, i.Value - 1), Nombre), 0) / t * 100}
        )
    )
);
ClearCollect(
    colDonutPriorite,
    ForAll(
        Sequence(CountRows(colPriorite)) As i,
        With(
            {r: Index(colPriorite, i.Value), t: Max(Sum(colPriorite, Nombre), 1)},
            {Couleur: r.Couleur, Pct: r.Nombre / t * 100, Debut: Coalesce(Sum(FirstN(colPriorite, i.Value - 1), Nombre), 0) / t * 100}
        )
    )
);
ClearCollect(
    colMois,
    ForAll(
        Sequence(6, 5, -1) As s,
        With(
            {d: DateAdd(Date(Year(Today()), Month(Today()), 1), -s.Value, TimeUnit.Months)},
            With(
                {m: Filter(colTickets, Year(Created) = Year(d) && Month(Created) = Month(d))},
                {
                    Idx: 5 - s.Value,
                    Libelle: Text(d, "mmm", "fr-FR"),
                    Nombre: CountRows(m),
                    Clos: CountRows(Filter(m, 'Ticket clôturer'.Value = "Oui"))
                }
            )
        )
    )
)""", LIST=LIST)


def donut_svg(dst, total_expr, caption):
    return code("""="data:image/svg+xml;utf8," & EncodeUrl(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 42 42'>" &
    "<circle cx='21' cy='21' r='15.915' fill='none' stroke='#EEF1F5' stroke-width='6'/>" &
    Concat(
        Filter({{DST}}, Pct > 0),
        "<circle cx='21' cy='21' r='15.915' fill='none' stroke='" & Couleur & "' stroke-width='6' stroke-dasharray='" &
        Text(Pct, "0.00", "en-US") & " " & Text(100 - Pct, "0.00", "en-US") &
        "' stroke-dashoffset='" & Text(25 - Debut, "0.00", "en-US") & "'/>"
    ) &
    "<text x='21' y='22' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='8' font-weight='700' fill='#1B1B1F'>" &
    {{TOTAL}} & "</text>" &
    "<text x='21' y='28' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='3.4' fill='#8A8A94'>{{CAPTION}}</text>" &
    "</svg>"
)""", DST=dst, TOTAL=total_expr, CAPTION=caption)


def legend_html(src, total_expr):
    return code("""="<div style='font-family:Segoe UI,sans-serif;font-size:13px;color:#1B1B1F'>" &
Concat(
    {{SRC}},
    "<div style='margin:10px 0'><span style='display:inline-block;width:12px;height:12px;border-radius:6px;background:" &
    Couleur & ";margin-right:8px;vertical-align:middle'></span>" & Libelle &
    "<span style='float:right;font-weight:600'>" & Nombre & "  <span style='color:#8A8A94;font-weight:400'>(" &
    Round(Nombre / Max({{TOTAL}}, 1) * 100, 0) & " %)</span></span></div>"
) & "</div>\"""", SRC=src, TOTAL=total_expr)


mois_svg = code("""=With(
    {m: Max(Coalesce(Max(colMois, Nombre), 0), 1)},
    "data:image/svg+xml;utf8," & EncodeUrl(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 175' font-family='Segoe UI,sans-serif'>" &
        "<line x1='10' y1='145' x2='310' y2='145' stroke='#E6E8EB' stroke-width='1'/>" &
        Concat(
            colMois,
            With(
                {h: Round(Nombre / m * 110, 0), x: 22 + Idx * 50},
                "<rect x='" & x & "' y='" & (145 - h) & "' width='32' height='" & h & "' rx='6' fill='" &
                If(Idx = 5, "#001E62", "#9DB0D9") & "'/>" &
                "<text x='" & (x + 16) & "' y='" & (138 - h) & "' text-anchor='middle' font-size='12' font-weight='600' fill='#1B1B1F'>" &
                Nombre & "</text>" &
                "<text x='" & (x + 16) & "' y='165' text-anchor='middle' font-size='11' fill='#8A8A94'>" & Libelle & "</text>"
            )
        ) &
        "</svg>"
    )
)""")

empile_svg = code("""=With(
    {m: Max(Coalesce(Max(colMois, Nombre), 0), 1)},
    "data:image/svg+xml;utf8," & EncodeUrl(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 190' font-family='Segoe UI,sans-serif'>" &
        "<rect x='12' y='4' width='10' height='10' rx='2' fill='#107C10'/><text x='27' y='13' font-size='11' fill='#5C5C66'>Clôturés</text>" &
        "<rect x='92' y='4' width='10' height='10' rx='2' fill='#5B9BD5'/><text x='107' y='13' font-size='11' fill='#5C5C66'>Encore ouverts</text>" &
        "<line x1='10' y1='160' x2='310' y2='160' stroke='#E6E8EB' stroke-width='1'/>" &
        Concat(
            colMois,
            With(
                {hc: Round(Clos / m * 110, 0), ho: Round((Nombre - Clos) / m * 110, 0), x: 22 + Idx * 50},
                "<rect x='" & x & "' y='" & (160 - hc) & "' width='32' height='" & hc & "' fill='#107C10'/>" &
                "<rect x='" & x & "' y='" & (160 - hc - ho) & "' width='32' height='" & ho & "' fill='#5B9BD5'/>" &
                "<text x='" & (x + 16) & "' y='" & (153 - hc - ho) & "' text-anchor='middle' font-size='11' font-weight='600' fill='#1B1B1F'>" &
                Clos & "/" & Nombre & "</text>" &
                "<text x='" & (x + 16) & "' y='180' text-anchor='middle' font-size='11' fill='#8A8A94'>" & Libelle & "</text>"
            )
        ) &
        "</svg>"
    )
)""")


def chart_card(key, titre_txt, body, sous_titre=None):
    kids = [label(f"acGraph{key}Titre", f'"{titre_txt}"', Height=24, AlignInContainer="AlignInContainer.Stretch",
                  Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle")]
    if sous_titre:
        kids.append(label(f"acGraph{key}SousTitre", sous_titre, Height=18, AlignInContainer="AlignInContainer.Stretch",
                          Size=11, Color=TXT2, VerticalAlign="VerticalAlign.Middle"))
    return auto(f"acGraph{key}", "Vertical", kids + body, FillPortions=1, LayoutMinWidth=0,
                AlignInContainer="AlignInContainer.Stretch", LayoutGap=6,
                PaddingTop=16, PaddingBottom=16, PaddingLeft=18, PaddingRight=18, **CARD)


def donut_body(key, svg, legend):
    return [auto(f"acDonut{key}Zone", "Horizontal", [
        ctrl(f"acDonut{key}", IMAGE, {"Image": svg, "ImagePosition": "ImagePosition.Fit", "Width": 170,
                                       "Height": 170, "LayoutMinWidth": 140,
                                       "AlignInContainer": "AlignInContainer.Center"}),
        ctrl(f"acDonut{key}Legende", HTML, {"HtmlText": legend, "AutoHeight": "false", "FillPortions": 1,
                                             "LayoutMinHeight": 60, "Height": 140,
                                             "AlignInContainer": "AlignInContainer.Center"}),
    ], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutAlignItems="LayoutAlignItems.Center",
        LayoutGap=16)]


H = 300


def chart_row(name, cards, h=H):
    return auto(name, "Horizontal", cards,
                LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
                Height=ph(len(cards) * h + (len(cards) - 1) * 16, h), FillPortions=0,
                AlignInContainer="AlignInContainer.Stretch", LayoutGap=16)


def nb_st(lib):
    return f'Coalesce(LookUp(colStatut, Libelle = "{lib}").Nombre, 0)'


it = "ThisItem."
urg_card = manual("acUrgentCarte", [
    ctrl("acUrgentBarre", RECT, {"X": 0, "Y": 0, "Width": 4, "Height": "Parent.Height", "Fill": f'ColorValue("{ROUGE}")'}),
    label("acUrgentTitre", f'"#" & ThisItem.ID & "  ·  " & {titre(it)}', X=16, Y=8, Width="Parent.Width - 150",
          Height=22, Size=13, FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false"),
    label("acUrgentInfos", f"Coalesce(ThisItem.'Intervention sur équipement'.Value, \"—\") & \"  ·  \" & "
                           f"Coalesce(ThisItem.'Secteur demandeur'.Value, \"—\") & \"  ·  \" & Text(ThisItem.Created, \"dd/mm/yyyy\")",
          X=16, Y=30, Width="Parent.Width - 150", Height=18, Size=11, Color=TXT3, Wrap="false"),
    badge("acUrgentStatut", st_lbl(it), st_bg(it), st_fg(it), 110, X="Parent.Width - 124", Y=16),
    overlay_button("acUrgentClic", Block("=Set(varTicket, ThisItem);\nNavigate(scrDetail, ScreenTransition.Fade)"), r=10),
], X=0, Y=0, Width="Parent.TemplateWidth", Height="Parent.TemplateHeight - 8", Fill='ColorValue("#FFF8F8")',
    BorderColor='ColorValue("#F6D3D5")', BorderThickness=1, **radius(10))

urgents = auto("acUrgents", "Vertical", [
    label("acUrgentsTitre", '"🚨  Tickets prioritaires à traiter"', Height=24, AlignInContainer="AlignInContainer.Stretch",
          Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    label("acUrgentsVide", '"✅  Aucun ticket prioritaire en attente."', Height=36,
          AlignInContainer="AlignInContainer.Stretch", Size=12, Color=f'ColorValue("{VERT}")',
          Visible="CountRows(acUrgentsListe.AllItems) = 0", VerticalAlign="VerticalAlign.Middle"),
    ctrl("acUrgentsListe", GALLERY, {
        "Items": "FirstN(Sort(Filter(colTickets, StartsWith('Statut Urgence'.Value, \"High\") && 'Ticket clôturer'.Value <> \"Oui\"), Created, SortOrder.Descending), 5)",
        "TemplateSize": 64, "TemplatePadding": 0, "ShowScrollbar": "false", "FillPortions": 1,
        "LayoutMinHeight": 0, "AlignInContainer": "AlignInContainer.Stretch",
    }, [urg_card], variant="Vertical"),
], Height=380, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8,
    PaddingTop=16, PaddingBottom=12, PaddingLeft=18, PaddingRight=18, **CARD)

ac_content = content("ac", [
    page_header("ac", "Tableau de bord",
                '"Vue d\'ensemble de la maintenance  ·  mise à jour à " & Text(varMaj, "hh:mm")',
                [button("acActualiser", "↻  Actualiser", actualiser, ph(48, 130),
                        Text=f'If({PH}, "↻", "↻  Actualiser")')]),
    kpi_row("acKpis", [
        kpi("ac", "Total", "Tickets au total", "📊", "#001E62", "varTotal"),
        kpi("ac", "NonDemarres", "Non démarrés", "⏸️", GRIS, nb_st("Non démarré")),
        kpi("ac", "EnCours", "En cours", "⏳", "#B97A00", nb_st("En cours")),
        kpi("ac", "Clotures", "Clôturés", "✅", VERT, nb_st("Clôturé")),
        kpi("ac", "Prioritaires", "Prioritaires ouverts", "🔥", ROUGE, "varPrioritaires"),
    ]),
    chart_row("acLigne1", [
        chart_card("Statut", "Répartition par statut",
                   donut_body("Statut", donut_svg("colDonutStatut", "varTotal", "tickets"),
                              legend_html("colStatut", "varTotal"))),
        chart_card("Priorite", "Répartition par priorité",
                   donut_body("Priorite", donut_svg("colDonutPriorite", "Sum(colPriorite, Nombre)", "tickets"),
                              legend_html("colPriorite", "Sum(colPriorite, Nombre)"))),
    ]),
    chart_row("acLigne2", [
        chart_card("Mois", "Tickets créés par mois", [
            ctrl("acMois", IMAGE, {"Image": mois_svg, "ImagePosition": "ImagePosition.Fit", "FillPortions": 1,
                                   "LayoutMinHeight": 120, "AlignInContainer": "AlignInContainer.Stretch"})],
                   '"6 derniers mois"'),
        chart_card("Clos", "Clôturés vs encore ouverts", [
            ctrl("acClos", IMAGE, {"Image": empile_svg, "ImagePosition": "ImagePosition.Fit", "FillPortions": 1,
                                   "LayoutMinHeight": 120, "AlignInContainer": "AlignInContainer.Stretch"})],
                   f'Round({nb_st("Clôturé")} / Max(varTotal, 1) * 100, 0) & " % des tickets sont clôturés  ·  " & ({nb_st("Non démarré")} + {nb_st("En cours")}) & " encore ouverts"'),
    ]),
    urgents,
], scroll=True)

screen_accueil = {"Screens": {"scrAccueil": {
    "Properties": {"Fill": f(BG), "OnVisible": f("Select(acActualiser)")},
    "Children": [screen_shell("ac", "Accueil", ac_content)],
}}}


# ======================================================================
#  ÉCRAN 2 – LISTE DES TICKETS (scrListe)
# ======================================================================
P = "li"
recharger = Block("=Refresh('Ticket dépannage');\nClearCollect(colTickets, 'Ticket dépannage')")

ST_FILTRE = "Switch('Ticket clôturer'.Value, \"Oui\", \"Clôturé\", \"En cours\", \"En cours\", \"Non démarré\")"
PR_FILTRE = ("Switch(First(Split(Coalesce('Statut Urgence'.Value, \"\"), \" \")).Value, "
             "\"High\", \"Haute\", \"Medium\", \"Moyenne\", \"Low\", \"Basse\", \"—\")")
RANK = ("Switch(First(Split(Coalesce('Statut Urgence'.Value, \"\"), \" \")).Value, "
        "\"High\", 1, \"Medium\", 2, \"Low\", 3, 4)")

items_liste = code("""=With(
    {
        d: Filter(
            colTickets,
            (IsBlank(liFiltreStatut.Selected.Value) || {{ST}} = liFiltreStatut.Selected.Value) &&
            (IsBlank(liFiltrePriorite.Selected.Value) || {{PR}} = liFiltrePriorite.Selected.Value) &&
            (
                IsBlank(liRecherche.Text) ||
                liRecherche.Text in Description ||
                liRecherche.Text in Title ||
                liRecherche.Text in Author.DisplayName ||
                liRecherche.Text in 'Prise en charge'.DisplayName ||
                liRecherche.Text in 'Intervention sur équipement'.Value ||
                liRecherche.Text in 'Secteur demandeur'.Value ||
                liRecherche.Text in Text(ID)
            )
        )
    },
    Switch(
        Coalesce(liTri.Selected.Value, "Priorité puis date"),
        "Date (plus récent)", Sort(d, Created, SortOrder.Descending),
        "Date (plus ancien)", Sort(d, Created, SortOrder.Ascending),
        "Priorité", Sort(d, {{RANK}}, SortOrder.Ascending),
        Sort(d, {{RANK}} * 100000000 + DateDiff(Created, DateTime(2100, 1, 1, 0, 0, 0), TimeUnit.Minutes), SortOrder.Ascending)
    )
)""", ST=ST_FILTRE, PR=PR_FILTRE, RANK=RANK)


def col_x(W):
    """Positions des colonnes du tableau (identiques pour l'en-tête et les lignes)."""
    R = f"({W} - 16)"
    x_clo = f"({R} - 100)"
    x_st = f"(If({WIDE}, {x_clo} - 8, {R}) - 112)"
    x_pr = f"({x_st} - 8 - 112)"
    x_resp = f"({x_pr} - 8 - 150)"
    x_dem = f"({x_resp} - 8 - 150)"
    x_desc = "196"
    w_desc = f"(If({WIDE}, {x_dem}, {x_pr}) - 8 - 196)"
    return dict(num=("16", "64"), date=("88", "100"), desc=(x_desc, w_desc), dem=(x_dem, "150"),
                resp=(x_resp, "150"), pr=(x_pr, "112"), st=(x_st, "112"), clo=(x_clo, "100"))


def entete_tableau():
    c = col_x("Parent.Width")
    cols = [("num", "N°", "true"), ("date", "Créé le", "true"), ("desc", "Description", "true"),
            ("dem", "Demandeur", WIDE), ("resp", "Responsable", WIDE), ("pr", "Priorité", "true"),
            ("st", "Statut", "true"), ("clo", "Clôturé le", WIDE)]
    kids = [label(f"liCol{k.capitalize()}", f'"{t}"', X=c[k][0], Y=0, Width=c[k][1], Height="Parent.Height", Size=11,
                  FontWeight="FontWeight.Semibold", Color=TXT2, VerticalAlign="VerticalAlign.Middle", Visible=v,
                  Align="Align.Center" if k in ("pr", "st") else "Align.Left")
            for k, t, v in cols]
    return manual("liEnTeteTableau", kids, Height=40, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
                  Fill='ColorValue("#F7F8FA")', Visible=f"!({PH})", **radius(8))


c = col_x("Parent.TemplateWidth")
DESK = f"!({PH})"
it = "ThisItem."
date_clo = (f"If(ThisItem.'Ticket clôturer'.Value = \"Oui\", Text(ThisItem.Modified, \"dd/mm/yyyy\") & "
            f"If(IsBlank(ThisItem.'Heure cloture du ticket'), \"\", \" \" & ThisItem.'Heure cloture du ticket'), \"—\")")
ligne = [
    ctrl("liLigneBarre", RECT, {"X": 0, "Y": 8, "Width": 4, "Height": "Parent.TemplateHeight - 16", "Fill": pr_bar(it)}),
    # --- ordinateur / tablette
    label("liLigneNum", '"#" & ThisItem.ID', X=c["num"][0], Y=0, Width=c["num"][1], Height="Parent.TemplateHeight",
          Size=12, FontWeight="FontWeight.Semibold", Color=NAVY_C, VerticalAlign="VerticalAlign.Middle", Visible=DESK),
    label("liLigneDate", 'Text(ThisItem.Created, "dd/mm/yyyy")', X=c["date"][0], Y=0, Width=c["date"][1],
          Height="Parent.TemplateHeight", Size=12, Color=TXT2, VerticalAlign="VerticalAlign.Middle", Visible=DESK),
    label("liLigneDesc", titre(it), X=c["desc"][0], Y=9, Width=c["desc"][1], Height=22, Size=13,
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false", Visible=DESK),
    label("liLigneLieu", "Coalesce(ThisItem.'Intervention sur équipement'.Value, \"—\") & \"  ·  \" & Coalesce(ThisItem.'Secteur demandeur'.Value, \"—\")",
          X=c["desc"][0], Y=31, Width=c["desc"][1], Height=18, Size=11, Color=TXT3, Wrap="false", Visible=DESK),
    label("liLigneDemandeur", "ThisItem.Author.DisplayName", X=c["dem"][0], Y=0, Width=c["dem"][1],
          Height="Parent.TemplateHeight", Size=12, Color=TXT2, Wrap="false", VerticalAlign="VerticalAlign.Middle",
          Visible=f"{DESK} && {WIDE}"),
    label("liLigneResponsable", "Coalesce(ThisItem.'Prise en charge'.DisplayName, \"Non assigné\")", X=c["resp"][0], Y=0,
          Width=c["resp"][1], Height="Parent.TemplateHeight", Size=12,
          Color=f"If(IsBlank(ThisItem.'Prise en charge'.DisplayName), {TXT3}, {TXT2})", Wrap="false",
          VerticalAlign="VerticalAlign.Middle", Visible=f"{DESK} && {WIDE}"),
    badge("liLignePriorite", pr_lbl(it), pr_bg(it), pr_fg(it), 104, X=f"{c['pr'][0]} + 4",
          Y="(Parent.TemplateHeight - 24) / 2", Visible=DESK),
    badge("liLigneStatut", st_lbl(it), st_bg(it), st_fg(it), 104, X=f"{c['st'][0]} + 4",
          Y="(Parent.TemplateHeight - 24) / 2", Visible=DESK),
    label("liLigneCloture", date_clo, X=c["clo"][0], Y=0, Width=c["clo"][1], Height="Parent.TemplateHeight", Size=11,
          Color=TXT2, VerticalAlign="VerticalAlign.Middle", Visible=f"{DESK} && {WIDE}"),
    # --- téléphone
    label("liTelEnTete", '"#" & ThisItem.ID & "  ·  " & Text(ThisItem.Created, "dd/mm/yyyy")', X=16, Y=10,
          Width="Parent.TemplateWidth - 32", Height=18, Size=11, FontWeight="FontWeight.Semibold", Color=NAVY_C,
          Visible=PH),
    label("liTelDesc", titre(it), X=16, Y=30, Width="Parent.TemplateWidth - 32", Height=22, Size=13,
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false", Visible=PH),
    label("liTelInfos", "ThisItem.Author.DisplayName & \"  ·  \" & Coalesce(ThisItem.'Prise en charge'.DisplayName, \"Non assigné\")",
          X=16, Y=52, Width="Parent.TemplateWidth - 32", Height=18, Size=11, Color=TXT3, Wrap="false", Visible=PH),
    badge("liTelPriorite", pr_lbl(it), pr_bg(it), pr_fg(it), 96, X=16, Y=74, Visible=PH),
    badge("liTelStatut", st_lbl(it), st_bg(it), st_fg(it), 104, X=120, Y=74, Visible=PH),
    # --- séparateur + clic
    ctrl("liLigneTrait", RECT, {"X": 0, "Y": "Parent.TemplateHeight - 1", "Width": "Parent.TemplateWidth",
                                "Height": 1, "Fill": 'ColorValue("#EEF0F3")'}),
    overlay_button("liLigneClic", Block("=Set(varTicket, ThisItem);\nNavigate(scrDetail, ScreenTransition.Fade)"),
                   r=0, hover="RGBA(0, 30, 98, 0.04)", Width="Parent.TemplateWidth", Height="Parent.TemplateHeight"),
]

galerie = ctrl("liGalerie", GALLERY, {
    "Items": items_liste, "TemplateSize": ph(104, 58), "TemplatePadding": 0, "ShowScrollbar": "false",
    "FillPortions": 1, "LayoutMinHeight": 0, "AlignInContainer": "AlignInContainer.Stretch",
}, ligne, variant="Vertical")

FA = f"If({PH}, AlignInContainer.Stretch, AlignInContainer.Center)"


def combo(name, items, width, **p):
    props = {"Items": items, "ItemDisplayText": "ThisItem.Value", "SelectMultiple": "false",
             "IsSearchable": "false", "Appearance": "Appearance.Outline", "Width": width, "Height": 36,
             "Size": 12, "LayoutMinWidth": width, "AlignInContainer": FA}
    props.update(p)
    return ctrl(name, COMBO, props)


filtres = auto("liFiltres", "Horizontal", [
    ctrl("liRecherche", TEXTINPUT, {
        "Default": '""', "HintText": '"🔍  Rechercher : n°, description, équipement, demandeur…"',
        "DelayOutput": "true", "Height": 36, "FillPortions": ph(0, 1), "LayoutMinWidth": 180, "Size": 12,
        "AlignInContainer": FA, "Fill": 'ColorValue("#F7F8FA")', "Color": TXT, "BorderColor": BORDER,
        "BorderThickness": 1, "HoverBorderColor": 'ColorValue("#C3C8D0")', "FocusedBorderColor": NAVY_C,
        "PaddingLeft": 12, **radius(8),
    }),
    combo("liFiltreStatut", 'Table({Value: "Non démarré"}, {Value: "En cours"}, {Value: "Clôturé"})', 160),
    combo("liFiltrePriorite", 'Table({Value: "Haute"}, {Value: "Moyenne"}, {Value: "Basse"})', 140),
    combo("liTri", 'Table({Value: "Priorité puis date"}, {Value: "Date (plus récent)"}, {Value: "Date (plus ancien)"}, {Value: "Priorité"})',
          190, DefaultSelectedItems='Table({Value: "Priorité puis date"})'),
    button("liReinitialiser", "Réinitialiser",
           Block("=Reset(liRecherche);\nReset(liFiltreStatut);\nReset(liFiltrePriorite);\nReset(liTri)"), 120,
           AlignInContainer=FA),
], LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
    Height=ph(232, 60), FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
    LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=ph(8, 10), PaddingLeft=12, PaddingRight=12,
    PaddingTop=ph(10, 0), PaddingBottom=ph(10, 0), **CARD)

tableau = auto("liTableau", "Vertical", [
    entete_tableau(),
    label("liVide", '"Aucun ticket ne correspond à vos critères."', Height=60, AlignInContainer="AlignInContainer.Stretch",
          Align="Align.Center", Size=13, Color=TXT3, Visible="CountRows(liGalerie.AllItems) = 0",
          VerticalAlign="VerticalAlign.Middle"),
    galerie,
], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=0, **CARD, **PAD(8))

li_content = content("li", [
    page_header("li", "Tickets", 'CountRows(liGalerie.AllItems) & " ticket(s) affiché(s) sur " & CountRows(colTickets)', [
        button("liActualiser", "↻", recharger, 44),
        button("liNouveau", "+ Nouveau ticket", Block("=NewForm(Form1);\nNavigate(scrCreer, ScreenTransition.Fade)"),
               ph(110, 160), primary=True, Text=f'If({PH}, "+ Nouveau", "+ Nouveau ticket")'),
    ]),
    filtres,
    tableau,
])

screen_liste = {"Screens": {"scrListe": {
    "Properties": {"Fill": f(BG), "OnVisible": recharger},
    "Children": [screen_shell("li", "Tickets", li_content)],
}}}


# ======================================================================
#  ÉCRAN 3 – CRÉER UN TICKET (scrCreer)  — accueille le formulaire Form1
# ======================================================================
P = "cr"
conseils_html = Block("""="<div style='font-family:Segoe UI,sans-serif;font-size:12px;color:#424242;line-height:1.6'>" &
"<div style='font-weight:600;color:#1B1B1F;margin:4px 0 6px'>Niveau de priorité</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#D13438;margin-right:8px'></span><b>High</b> : activité à l'arrêt</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#F7A600;margin-right:8px'></span><b>Medium</b> : ralentissement de l'activité</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#13A10E;margin-right:8px'></span><b>Low</b> : n'impacte pas l'activité</div>" &
"<div style='font-weight:600;color:#1B1B1F;margin:14px 0 6px'>Pour un traitement rapide</div>" &
"<ul style='margin:0;padding-left:18px'>" &
"<li>Ajoutez au moins une photo de l'équipement.</li>" &
"<li>Précisez la cellule et l'équipement concernés.</li>" &
"<li>Indiquez un plan B si l'activité est bloquée.</li>" &
"</ul></div>\"""")

mes_card = manual("crMesCarte", [
    label("crMesTitre", titre(it), X=12, Y=8, Width="Parent.Width - 130", Height=22, Size=12,
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false"),
    label("crMesInfo", '"#" & ThisItem.ID & "  ·  " & Text(ThisItem.Created, "dd/mm/yyyy")', X=12, Y=30,
          Width="Parent.Width - 130", Height=18, Size=11, Color=TXT3, Wrap="false"),
    badge("crMesStatut", st_lbl(it), st_bg(it), st_fg(it), 104, X="Parent.Width - 114", Y=16),
    overlay_button("crMesClic", Block("=Set(varTicket, ThisItem);\nNavigate(scrDetail, ScreenTransition.Fade)"), r=10),
], X=0, Y=0, Width="Parent.TemplateWidth", Height="Parent.TemplateHeight - 8", Fill='ColorValue("#F7F8FA")',
    BorderColor='ColorValue("#EEF0F3")', BorderThickness=1, **radius(10))

aide = auto("crAide", "Vertical", [
    auto("crConseils", "Vertical", [
        label("crConseilsTitre", '"💡  Avant d\'envoyer"', Height=24, AlignInContainer="AlignInContainer.Stretch",
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        ctrl("crConseilsTexte", HTML, {"HtmlText": conseils_html, "AutoHeight": "false", "FillPortions": 1,
                                       "LayoutMinHeight": 100, "AlignInContainer": "AlignInContainer.Stretch"}),
    ], Height=290, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=6, **CARD, **PAD(16)),
    auto("crMes", "Vertical", [
        label("crMesEntete", '"🕘  Mes derniers tickets"', Height=24, AlignInContainer="AlignInContainer.Stretch",
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        label("crMesVide", '"Vous n\'avez encore créé aucun ticket."', Height=36,
              AlignInContainer="AlignInContainer.Stretch", Size=12, Color=TXT3,
              Visible="CountRows(crMesListe.AllItems) = 0", VerticalAlign="VerticalAlign.Middle"),
        ctrl("crMesListe", GALLERY, {
            "Items": f'FirstN(Sort(Filter({LIST}, Author.Email = User().Email), ID, SortOrder.Descending), 5)',
            "TemplateSize": 64, "TemplatePadding": 0, "ShowScrollbar": "false", "FillPortions": 1,
            "LayoutMinHeight": 0, "AlignInContainer": "AlignInContainer.Stretch",
        }, [mes_card], variant="Vertical"),
    ], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8, **CARD, **PAD(16)),
], FillPortions=1, LayoutMinWidth=280, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16,
    Visible="App.Width >= 1250")

bandeau = auto("crBandeau", "Horizontal", [
    label("crBandeauTexte", '"✅  Ticket n° " & varNumTicket & " enregistré. L\'équipe maintenance a été prévenue."',
          FillPortions=1, Height=40, Size=ph(12, 13), FontWeight="FontWeight.Semibold",
          Color='ColorValue("#0E700E")', VerticalAlign="VerticalAlign.Middle"),
    button("crBandeauVoir", "Voir le ticket",
           Block("=Set(varTicket, LookUp('Ticket dépannage', ID = varNumTicket));\nNavigate(scrDetail, ScreenTransition.Fade)"),
           120, Visible=f"!({PH})"),
    ctrl("crBandeauFermer", BUTTON, {
        "Text": '"✕"', "Width": 32, "Height": 32, "LayoutMinWidth": 32, "Size": 12, "Fill": TRANSP,
        "Color": 'ColorValue("#0E700E")', "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP,
        "HoverFill": 'ColorValue("#CDEFCB")', "HoverColor": 'ColorValue("#0E700E")', "HoverBorderColor": TRANSP,
        "PressedFill": 'ColorValue("#BFE8BC")', "PressedColor": 'ColorValue("#0E700E")', "PressedBorderColor": TRANSP,
        "OnSelect": "Set(varMsgCreation, false)", **radius(16),
    }),
], Height=54, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", Visible="varMsgCreation",
    Fill='ColorValue("#DFF6DD")', BorderColor='ColorValue("#9FD89F")', BorderThickness=1, LayoutGap=8,
    LayoutAlignItems="LayoutAlignItems.Center", PaddingLeft=16, PaddingRight=8, **radius(10))

actions_cr = auto("crActions", "Horizontal", [
    label("crActionsAide", '"Les champs marqués d\'un * sont obligatoires."', FillPortions=1, Height=36, Size=12,
          Color=TXT3, VerticalAlign="VerticalAlign.Middle", Visible=f"!({PH})"),
    auto("crActionsEspace", "Horizontal", None, FillPortions=ph(1, 0), Width=1, Height=10, Visible=PH),
    button("crEffacer", "Effacer", Block("=ResetForm(Form1);\nNewForm(Form1);\nSet(varMsgCreation, false)"), ph(100, 120)),
    button("crEnvoyer", "Créer le ticket", "SubmitForm(Form1)", ph(140, 170), primary=True,
           DisplayMode="If(Form1.Valid, DisplayMode.Edit, DisplayMode.Disabled)",
           DisabledFill='ColorValue("#C7CFDF")', DisabledColor='ColorValue("#FFFFFF")',
           DisabledBorderColor='ColorValue("#C7CFDF")'),
], Height=64, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutAlignItems="LayoutAlignItems.Center",
    LayoutGap=10, PaddingLeft=ph(12, 18), PaddingRight=ph(12, 14), **CARD)

cr_content = content("cr", [
    page_header("cr", "Nouveau ticket", '"Décrivez le problème : il sera enregistré directement dans Microsoft Lists."', []),
    bandeau,
    auto("crZone", "Horizontal", [
        auto("crFormulaire", "Vertical", None, FillPortions=3, LayoutMinWidth=0,
             AlignInContainer="AlignInContainer.Stretch", **CARD, **PAD(8)),
        aide,
    ], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16),
    actions_cr,
])

screen_creer = {"Screens": {"scrCreer": {
    "Properties": {"Fill": f(BG), "OnVisible": Block("=Set(varMsgCreation, false);\nNewForm(Form1)")},
    "Children": [screen_shell("cr", "Créer", cr_content)],
}}}


# ======================================================================
#  ÉCRAN 4 – DÉTAIL ET SUIVI (scrDetail)
# ======================================================================
P = "de"
vt = "varTicket."
APRES = ("If(\n    IsEmpty(Errors('Ticket dépannage')),\n"
         "    ClearCollect(colTickets, 'Ticket dépannage');\n"
         "    Reset(deDescription);\n    Reset(dePriorite);\n    Reset(deStatut);\n    Reset(deResponsable);\n"
         "    Reset(deResolution);\n    Notify(\"{msg}\", NotificationType.Success),\n"
         "    Notify(\"Erreur : \" & First(Errors('Ticket dépannage')).Message, NotificationType.Error)\n)")


def patch_action(fields, msg):
    return Block(f"=With(\n    {{moi: {MOI}}},\n    Set(\n        varTicket,\n"
                 f"        Patch(\n            'Ticket dépannage',\n            LookUp('Ticket dépannage', ID = varTicket.ID),\n"
                 f"            {fields}\n        )\n    )\n);\n" + APRES.format(msg=msg))


RESP_OU_MOI = "If(IsBlank(varTicket.'Prise en charge'.Email), moi, varTicket.'Prise en charge')"
act_en_cours = patch_action(f"{{'Ticket clôturer': {{Value: \"En cours\"}}, 'Prise en charge': {RESP_OU_MOI}}}",
                            "Ticket passé en cours")
act_cloturer = patch_action(
    f"{{'Ticket clôturer': {{Value: \"Oui\"}}, 'Heure cloture du ticket': Text(Now(), \"hh:mm\"), "
    f"'Résolution de l''intervention': deResolution.Text, 'Prise en charge': {RESP_OU_MOI}}}", "Ticket clôturé")
act_rouvrir = patch_action("{'Ticket clôturer': {Value: \"En cours\"}, 'Heure cloture du ticket': \"\"}", "Ticket rouvert")
act_assigner = patch_action("{'Prise en charge': moi}", "Ticket assigné à vous")
act_enregistrer = patch_action(
    "{\n                Description: deDescription.Text,\n                'Statut Urgence': dePriorite.Selected,\n"
    "                'Ticket clôturer': deStatut.Selected,\n                'Prise en charge': deResponsable.Selected,\n"
    "                'Résolution de l''intervention': deResolution.Text,\n"
    "                'Heure cloture du ticket': If(deStatut.Selected.Value = \"Oui\", Coalesce(varTicket.'Heure cloture du ticket', Text(Now(), \"hh:mm\")), \"\")\n"
    "            }", "Modifications enregistrées")

infos_html = code("""=With(
    {t: varTicket},
    "<div style='font-family:Segoe UI,sans-serif;font-size:13px;color:#1B1B1F'>" &
    "<table style='width:100%;border-collapse:collapse'>" &
    Concat(
        Table(
            {k: "Demandeur", v: t.Author.DisplayName},
            {k: "Créé le", v: Text(t.Created, "dd/mm/yyyy hh:mm")},
            {k: "Date de la demande", v: Text(t.'Date de la demande', "dd/mm/yyyy") & " " & t.'Heure ticket'},
            {k: "Secteur", v: t.'Secteur demandeur'.Value},
            {k: "Cellule", v: t.'Dans quelle cellule devons nous intervenir ?'.Value},
            {k: "Équipement", v: t.'Intervention sur équipement'.Value},
            {k: "Responsable", v: t.'Prise en charge'.DisplayName},
            {k: "Clôturé le", v: If(t.'Ticket clôturer'.Value = "Oui", Text(t.Modified, "dd/mm/yyyy") & " " & t.'Heure cloture du ticket', "")}
        ),
        "<tr><td style='color:#8A8A94;padding:8px 12px 8px 0;width:42%;border-bottom:1px solid #F0F0F3;vertical-align:top'>" & k &
        "</td><td style='padding:8px 0;border-bottom:1px solid #F0F0F3;font-weight:600'>" & Coalesce(v, "—") & "</td></tr>"
    ) &
    "</table>" &
    If(
        IsBlank(t.'Plan B en attendant l''intervention'),
        "",
        "<div style='margin-top:16px'><div style='color:#8A8A94;font-size:12px;margin-bottom:6px'>Plan B en attendant l'intervention</div>" &
        "<div style='background:#FFF8EC;border:1px solid #FBE3B5;border-radius:8px;padding:10px 12px;line-height:1.5'>" &
        Substitute(Substitute(Substitute(t.'Plan B en attendant l''intervention', "&", "&amp;"), "<", "&lt;"), Char(10), "<br>") &
        "</div></div>"
    ) &
    "</div>"
)""")

photos = [ctrl(f"dePhoto{n}", IMAGE, {
    "Image": f"varTicket.'Photo {n}'.Full", "ImagePosition": "ImagePosition.Fill", "FillPortions": 1,
    "LayoutMinWidth": 60, "AlignInContainer": "AlignInContainer.Stretch",
    "Visible": f"!IsBlank(varTicket.'Photo {n}')", "OnSelect": f"Launch(varTicket.'Photo {n}'.Full)",
    "BorderColor": BORDER, "BorderThickness": 1,
}) for n in (1, 2, 3)]

carte_infos = auto("deInfos", "Vertical", [
    label("deInfosTitre", '"📄  Informations"', Height=24, AlignInContainer="AlignInContainer.Stretch", Size=14,
          FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    auto("dePhotos", "Horizontal", photos, Height=120, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
         LayoutGap=8, Visible="!IsBlank(varTicket.'Photo 1') || !IsBlank(varTicket.'Photo 2') || !IsBlank(varTicket.'Photo 3')"),
    ctrl("deInfosDetail", HTML, {"HtmlText": infos_html, "AutoHeight": "false", "FillPortions": 1,
                                 "LayoutMinHeight": 120, "AlignInContainer": "AlignInContainer.Stretch"}),
], FillPortions=1, LayoutMinWidth=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=10, **CARD, **PAD(18))


def champ_label(name, txt):
    return label(name, f'"{txt}"', Height=20, AlignInContainer="AlignInContainer.Stretch", Size=12,
                 FontWeight="FontWeight.Semibold", Color=TXT2, VerticalAlign="VerticalAlign.Middle")


INPUT_STYLE = {"Fill": 'ColorValue("#F7F8FA")', "Color": TXT, "BorderColor": BORDER, "BorderThickness": 1,
               "HoverBorderColor": 'ColorValue("#C3C8D0")', "FocusedBorderColor": NAVY_C, "Size": 12,
               "PaddingLeft": 10, **radius(8), "AlignInContainer": "AlignInContainer.Stretch"}

carte_suivi = auto("deSuivi", "Vertical", [
    label("deSuiviTitre", '"✏️  Suivi et modification"', Height=24, AlignInContainer="AlignInContainer.Stretch",
          Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    champ_label("deLblDescription", "Description du problème"),
    ctrl("deDescription", TEXTINPUT, {"Default": "varTicket.Description", "Mode": "TextMode.MultiLine",
                                      "Height": 90, **INPUT_STYLE}),
    auto("deLigneChoix", "Horizontal", [
        auto("deBlocPriorite", "Vertical", [
            champ_label("deLblPriorite", "Priorité"),
            combo("dePriorite", f"Choices({LIST}.'Statut Urgence')", 150,
                  DefaultSelectedItems="Table(varTicket.'Statut Urgence')", AlignInContainer="AlignInContainer.Stretch"),
        ], FillPortions=1, Height=62, LayoutGap=4, AlignInContainer="AlignInContainer.Stretch"),
        auto("deBlocStatut", "Vertical", [
            champ_label("deLblStatut", "Statut (Ticket clôturer)"),
            combo("deStatut", f"Choices({LIST}.'Ticket clôturer')", 150,
                  DefaultSelectedItems="Table(varTicket.'Ticket clôturer')", AlignInContainer="AlignInContainer.Stretch"),
        ], FillPortions=1, Height=62, LayoutGap=4, AlignInContainer="AlignInContainer.Stretch"),
    ], Height=ph(132, 62), FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=12,
        LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)"),
    champ_label("deLblResponsable", "Responsable de l'intervention"),
    auto("deLigneResponsable", "Horizontal", [
        ctrl("deResponsable", COMBO_CLASSIC, {
            "Items": f"Choices({LIST}.'Prise en charge')",
            "DefaultSelectedItems": "If(IsBlank(varTicket.'Prise en charge'.Email), Blank(), Table(varTicket.'Prise en charge'))",
            "SelectMultiple": "false", "IsSearchable": "true", "SearchFields": '["DisplayName", "Email"]',
            "DisplayFields": '["DisplayName"]', "InputTextPlaceholder": '"Rechercher une personne…"',
            "FillPortions": 1, "Height": 36, "LayoutMinWidth": 120, "AlignInContainer": "AlignInContainer.Center",
        }),
        button("deMAssigner", "M'assigner", act_assigner, 110, AlignInContainer="AlignInContainer.Center"),
    ], Height=40, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8),
    champ_label("deLblResolution", "Informations de suivi / résolution (255 caractères max.)"),
    ctrl("deResolution", TEXTINPUT, {"Default": "varTicket.'Résolution de l''intervention'",
                                     "Mode": "TextMode.MultiLine", "MaxLength": 255, "Height": 80, **INPUT_STYLE}),
    label("deCompteur", 'Len(deResolution.Text) & " / 255"', Height=16, AlignInContainer="AlignInContainer.Stretch",
          Size=10, Color=TXT3, Align="Align.Right"),
    auto("deBoutons", "Horizontal", [
        auto("deBoutonsEspace", "Horizontal", None, FillPortions=1, Height=10),
        button("deAnnuler", "Annuler",
               Block("=Reset(deDescription);\nReset(dePriorite);\nReset(deStatut);\nReset(deResponsable);\nReset(deResolution)"),
               100),
        button("deEnregistrer", "💾  Enregistrer", act_enregistrer, 150, primary=True,
               DisplayMode="If(IsBlank(deDescription.Text), DisplayMode.Disabled, DisplayMode.Edit)",
               DisabledFill='ColorValue("#C7CFDF")', DisabledColor='ColorValue("#FFFFFF")',
               DisabledBorderColor='ColorValue("#C7CFDF")'),
    ], Height=44, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8,
        LayoutAlignItems="LayoutAlignItems.Center"),
], FillPortions=1, LayoutMinWidth=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8, **CARD, **PAD(18))

STATUT = "varTicket.'Ticket clôturer'.Value"
actions_de = auto("deActions", "Horizontal", [
    badge("deBadgeStatut", st_lbl(vt), st_bg(vt), st_fg(vt), 110, AlignInContainer="AlignInContainer.Center"),
    badge("deBadgePriorite", '"Priorité " & ' + pr_lbl(vt), pr_bg(vt), pr_fg(vt), 140,
          AlignInContainer="AlignInContainer.Center"),
    auto("deActionsEspace", "Horizontal", None, FillPortions=1, Height=10, Visible=f"!({PH})"),
    button("deEnCours", "▶  Passer en cours", act_en_cours, 160, primary=True,
           Visible=f'{STATUT} <> "En cours" && {STATUT} <> "Oui"', AlignInContainer="AlignInContainer.Center"),
    button("deCloturer", "✔  Clôturer", act_cloturer, 130, primary=True, Visible=f'{STATUT} <> "Oui"',
           Fill=f'ColorValue("{VERT}")', BorderColor=f'ColorValue("{VERT}")', HoverFill='ColorValue("#0B5A0B")',
           HoverBorderColor='ColorValue("#0B5A0B")', PressedFill='ColorValue("#094A09")',
           DisplayMode="If(IsBlank(deResolution.Text), DisplayMode.Disabled, DisplayMode.Edit)",
           DisabledFill='ColorValue("#BFD9BF")', DisabledColor='ColorValue("#FFFFFF")',
           DisabledBorderColor='ColorValue("#BFD9BF")', AlignInContainer="AlignInContainer.Center"),
    button("deRouvrir", "↺  Rouvrir", act_rouvrir, 120, Visible=f'{STATUT} = "Oui"',
           AlignInContainer="AlignInContainer.Center"),
], Height=48, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8,
    LayoutAlignItems="LayoutAlignItems.Center", LayoutOverflowX="LayoutOverflow.Scroll")

aide_cloture = label("deAideCloture", '"💡 Pour clôturer, renseignez d\'abord les informations de résolution."',
                     Height=18, AlignInContainer="AlignInContainer.Stretch", Size=11, Color=TXT3,
                     Visible=f'{STATUT} <> "Oui" && IsBlank(deResolution.Text)')

de_content = content("de", [
    page_header("de", "Détail du ticket",
                '"Ticket n° " & varTicket.ID & "  ·  " & ' + titre(vt),
                [button("deRetour", "← Retour", "Navigate(scrListe, ScreenTransition.Fade)", ph(80, 110))]),
    actions_de,
    aide_cloture,
    auto("deZone", "Horizontal", [carte_infos, carte_suivi],
         LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
         Height=ph(1260, 640), FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16),
], scroll=True)

screen_detail = {"Screens": {"scrDetail": {
    "Properties": {"Fill": f(BG), "OnVisible": Block(
        "=Set(varTicket, LookUp('Ticket dépannage', ID = varTicket.ID));\nReset(deDescription);\nReset(dePriorite);\n"
        "Reset(deStatut);\nReset(deResponsable);\nReset(deResolution)")},
    "Children": [screen_shell("de", "Tickets", de_content)],
}}}


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        yaml.dump(obj, fh, sort_keys=False, allow_unicode=True, width=10000, default_flow_style=False)


dump(screen_accueil, f"{OUT}/1-scrAccueil.pa.yaml")
dump(screen_liste, f"{OUT}/2-scrListe.pa.yaml")
dump(screen_creer, f"{OUT}/3-scrCreer.pa.yaml")
dump(screen_detail, f"{OUT}/4-scrDetail.pa.yaml")
print("ok")
