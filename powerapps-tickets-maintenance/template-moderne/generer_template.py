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
#  Réglages communs
# ======================================================================
PH = "App.Width < 700"            # téléphone
NOT_PH = "App.Width >= 700"


def ph(a, b):
    """Valeur téléphone / ordinateur."""
    return f"If({PH}, {a}, {b})"


def code(text, **subs):
    """Formule multi-ligne : remplace les marqueurs {{NOM}}."""
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", v)
    return Block(text)


# ---------------------------------------------------------------- en-tête
NAV = [
    ("Tickets", "Tickets", "Navigate(scrTickets, ScreenTransition.Fade)", 110, 70),
    ("Nouveau ticket", "+ Nouveau", "NewForm(Form1);\nNavigate(scrNouveauTicket, ScreenTransition.Fade)", 140, 92),
    ("Tableau de bord", "Stats", "Navigate(scrTableauBord, ScreenTransition.Fade)", 150, 60),
]


def header(p, active):
    kids = [
        label(f"{p}Logo", '"ASICS"', Width=ph(62, 82), Height=40, LayoutMinWidth=ph(62, 82),
              Size=ph(16, 20), FontWeight="FontWeight.Bold", Italic="true", Color=f"ColorValue({NAVY})",
              VerticalAlign="VerticalAlign.Middle"),
        label(f"{p}NomApp", '"Ticket de maintenance"', Width=210, Height=40, LayoutMinWidth=160,
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle",
              Visible=NOT_PH),
        auto(f"{p}Espace", "Horizontal", None, FillPortions=1, Height=10),
    ]
    for i, (txt, short, nav, w, ws) in enumerate(NAV):
        on = txt == active
        kids.append(ctrl(f"{p}Nav{i + 1}", BUTTON, {
            "Text": f'If({PH}, "{short}", "{txt}")', "Width": ph(ws, w), "Height": 36,
            "LayoutMinWidth": ph(ws, w), "Size": ph(11, 12), "FontWeight": "FontWeight.Semibold",
            "Fill": 'ColorValue("#E8EDF7")' if on else TRANSP,
            "Color": f"ColorValue({NAVY})" if on else TXT2,
            "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP, "HoverBorderColor": TRANSP,
            "PressedBorderColor": TRANSP, "HoverFill": 'ColorValue("#EEF1F7")',
            "HoverColor": f"ColorValue({NAVY})", "PressedFill": 'ColorValue("#E3E9F5")',
            "PressedColor": f"ColorValue({NAVY})", **radius(8), "OnSelect": "=" + nav,
        }))
    kids.append(label(f"{p}Utilisateur", "User().FullName", Width=170, Height=40, LayoutMinWidth=120,
                      Size=12, Color=TXT2, Align="Align.Right", VerticalAlign="VerticalAlign.Middle",
                      Visible="App.Width >= 900"))
    return [
        auto(f"{p}Entete", "Horizontal", kids, Fill=WHITE, Height=ph(56, 64), FillPortions=0,
             AlignInContainer="AlignInContainer.Stretch", LayoutAlignItems="LayoutAlignItems.Center",
             LayoutGap=ph(4, 8), PaddingLeft=ph(10, 24), PaddingRight=ph(10, 24)),
        ctrl(f"{p}Separateur", RECT, {"Fill": BORDER, "Height": 1,
                                       "AlignInContainer": "AlignInContainer.Stretch"}),
    ]


# ---------------------------------------------------------------- carte KPI
def kpi(p, key, titre, emoji, color, value, selected="false", onselect=None):
    c = f'ColorValue("{color}")'
    kids = [
        manual(f"{p}Kpi{key}Pastille", [
            label(f"{p}Kpi{key}Emoji", f'"{emoji}"', X=0, Y=0, Width=40, Height=40, Size=16,
                  Align="Align.Center", VerticalAlign="VerticalAlign.Middle"),
        ], X=14, Y="(Parent.Height - 40) / 2", Width=40, Height=40,
            Fill=f"ColorFade({c}, 0.85)", **radius(20)),
        label(f"{p}Kpi{key}Valeur", value, X=64, Y="Parent.Height / 2 - 26", Width="Parent.Width - 72",
              Height=30, Size=20, FontWeight="FontWeight.Bold", Color=c, VerticalAlign="VerticalAlign.Middle"),
        label(f"{p}Kpi{key}Titre", f'"{titre}"', X=64, Y="Parent.Height / 2 + 4", Width="Parent.Width - 72",
              Height=20, Size=12, FontWeight="FontWeight.Semibold", Color=TXT2, Wrap="false",
              VerticalAlign="VerticalAlign.Middle"),
    ]
    if onselect:
        kids.append(overlay_button(f"{p}Kpi{key}Clic", onselect))
    return manual(f"{p}Kpi{key}", kids, FillPortions=ph(0, 1), Width=150, LayoutMinWidth=ph(150, 130),
                  AlignInContainer="AlignInContainer.Stretch",
                  Fill=f"If({selected}, ColorFade({c}, 0.93), {WHITE})",
                  BorderColor=f"If({selected}, {c}, {BORDER})",
                  BorderThickness=f"If({selected}, 2, 1)", **radius(12))


def kpi_row(name, cards):
    return auto(name, "Horizontal", cards, Height=84, FillPortions=0,
                AlignInContainer="AlignInContainer.Stretch", LayoutGap=ph(8, 12),
                LayoutOverflowX="LayoutOverflow.Scroll")


# ---------------------------------------------------------------- statut / urgence
def statut_txt(it):
    return f'Switch({it}.\'Ticket clôturer\'.Value, "Oui", "Clôturé", "En cours", "En cours", "Ouvert")'


def statut_color(it):
    return f'ColorValue(Switch({it}.\'Ticket clôturer\'.Value, "Oui", "#107C10", "En cours", "#8A6100", "#0F6CBD"))'


def statut_fill(it):
    return f'ColorValue(Switch({it}.\'Ticket clôturer\'.Value, "Oui", "#DFF6DD", "En cours", "#FFF4CE", "#E5F0FB"))'


def urg_key(it):
    return f"First(Split(Coalesce({it}.'Statut Urgence'.Value, \"\"), \" \")).Value"


def urg_txt(it):
    k = urg_key(it)
    return f'Switch({k}, "High", "Urgence haute", "Medium", "Urgence moyenne", "Low", "Urgence basse", "Sans urgence")'


def urg_color(it):
    return f'ColorValue(Switch({urg_key(it)}, "High", "#A4262C", "Medium", "#8A6100", "Low", "#107C10", "#5C5C66"))'


def urg_fill(it):
    return f'ColorValue(Switch({urg_key(it)}, "High", "#FDE7E9", "Medium", "#FFF4CE", "Low", "#DFF6DD", "#F0F0F3"))'


def urg_bar(it):
    return f'ColorValue(Switch({urg_key(it)}, "High", "#D13438", "Medium", "#F7A600", "Low", "#13A10E", "#C8CCD2"))'


def titre(it):
    return f'Coalesce({it}.Title, {it}.Description, "Ticket sans titre")'


def badge(name, text, fill, color, width, **p):
    return manual(name, [
        label(f"{name}Txt", text, X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Size=11,
              FontWeight="FontWeight.Semibold", Color=color, Align="Align.Center",
              VerticalAlign="VerticalAlign.Middle"),
    ], Width=width, Height=26, LayoutMinWidth=width, Fill=fill, **radius(13), **p)


CARD = dict(Fill=WHITE, BorderColor=BORDER, BorderThickness=1, **radius(12))


# ======================================================================
#  ÉCRAN TICKETS
# ======================================================================
P = "tk"
gal_items = code("""=SortByColumns(
    Filter(
        {{LIST}},
        (IsBlank(varKpi) || 'Ticket clôturer'.Value = varKpi) &&
        (IsBlank(tkFiltreUrgence.Selected.Value) || 'Statut Urgence'.Value = tkFiltreUrgence.Selected.Value) &&
        (IsBlank(tkFiltreSecteur.Selected.Value) || 'Secteur demandeur'.Value = tkFiltreSecteur.Selected.Value) &&
        (
            IsBlank(tkRecherche.Text) ||
            tkRecherche.Text in Title ||
            tkRecherche.Text in Description ||
            tkRecherche.Text in 'Intervention sur équipement'.Value ||
            tkRecherche.Text in 'Secteur demandeur'.Value ||
            tkRecherche.Text in Text(ID)
        )
    ),
    "Created",
    SortOrder.Descending
)""", LIST=LIST)

it = "ThisItem"
sel_card = "varDetail && ThisItem.ID = varTicket.ID"
TW = ph("Parent.Width - 130", "Parent.Width - 170")
card = manual("tkCarte", [
    ctrl("tkCarteBarre", RECT, {"X": 0, "Y": 0, "Width": 5, "Height": "Parent.Height", "Fill": urg_bar(it)}),
    label("tkCarteNum", f'"#" & {it}.ID & "  ·  " & Text({it}.\'Date de la demande\', "dd/mm/yyyy") & " " & {it}.\'Heure ticket\'',
          X=18, Y=12, Width=TW, Height=18, Size=11, Color=TXT3, Wrap="false"),
    label("tkCarteTitre", titre(it), X=18, Y=32, Width=TW, Height=26, Size=ph(14, 15),
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false"),
    label("tkCarteInfos",
          f"Coalesce({it}.'Secteur demandeur'.Value, \"—\") & \"  ·  \" & Coalesce({it}.'Intervention sur équipement'.Value, \"—\")",
          X=18, Y=60, Width=TW, Height=20, Size=12, Color=TXT2, Wrap="false"),
    label("tkCarteAuteur", f"\"Par \" & {it}.Author.DisplayName", X=18, Y=82, Width=TW, Height=18, Size=11,
          Color=TXT3, Wrap="false"),
    badge("tkCarteStatut", statut_txt(it), statut_fill(it), statut_color(it), ph(104, 128),
          X=ph("Parent.Width - 114", "Parent.Width - 144"), Y=14),
    badge("tkCarteUrgence", urg_txt(it), urg_fill(it), urg_color(it), ph(104, 128),
          X=ph("Parent.Width - 114", "Parent.Width - 144"), Y=48),
    overlay_button("tkCarteClic", Block("=Set(varTicket, ThisItem);\nSet(varDetail, true)")),
], X=0, Y=0, Width="Parent.TemplateWidth - 12", Height="Parent.TemplateHeight - 10",
    Fill=WHITE, BorderColor=f"If({sel_card}, ColorValue({NAVY}), {BORDER})",
    BorderThickness=f"If({sel_card}, 2, 1)", **radius(12))

gallery = ctrl("tkGalerie", GALLERY, {
    "Items": gal_items, "TemplateSize": 118, "TemplatePadding": 0, "ShowScrollbar": "true",
    "FillPortions": 1, "LayoutMinHeight": 0, "AlignInContainer": "AlignInContainer.Stretch",
    "LoadingSpinner": "LoadingSpinner.Data",
}, [card], variant="Vertical")

FILL_ALIGN = f"If({PH}, AlignInContainer.Stretch, AlignInContainer.Center)"
filters = auto("tkFiltres", "Horizontal", [
    ctrl("tkRecherche", TEXTINPUT, {
        "Default": '""', "HintText": '"🔍  Rechercher un ticket, un équipement, un n°…"',
        "DelayOutput": "true", "Height": 36, "FillPortions": ph(0, 1), "LayoutMinWidth": 160, "Size": 12,
        "AlignInContainer": FILL_ALIGN,
        "Fill": 'ColorValue("#F7F8FA")', "Color": TXT, "BorderColor": BORDER, "BorderThickness": 1,
        "HoverBorderColor": 'ColorValue("#C3C8D0")', "FocusedBorderColor": f"ColorValue({NAVY})",
        "PaddingLeft": 12, **radius(8),
    }),
    ctrl("tkFiltreUrgence", COMBO, {
        "Items": f"Choices({LIST}.'Statut Urgence')", "ItemDisplayText": "ThisItem.Value",
        "SelectMultiple": "false", "IsSearchable": "false", "Appearance": "Appearance.Outline",
        "Width": 200, "Height": 36, "Size": 12, "LayoutMinWidth": 150, "AlignInContainer": FILL_ALIGN,
    }),
    ctrl("tkFiltreSecteur", COMBO, {
        "Items": f"Choices({LIST}.'Secteur demandeur')", "ItemDisplayText": "ThisItem.Value",
        "SelectMultiple": "false", "IsSearchable": "false", "Appearance": "Appearance.Outline",
        "Width": 180, "Height": 36, "Size": 12, "LayoutMinWidth": 140, "AlignInContainer": FILL_ALIGN,
    }),
    button("tkReinitialiser", "Réinitialiser",
           Block("=Reset(tkRecherche);\nReset(tkFiltreUrgence);\nReset(tkFiltreSecteur);\nSet(varKpi, Blank())"),
           120, AlignInContainer=FILL_ALIGN),
], LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
    Height=ph(190, 58), FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
    LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=ph(8, 10), PaddingLeft=12, PaddingRight=12,
    PaddingTop=ph(10, 0), PaddingBottom=ph(10, 0), **CARD)


def nb_tk(val):
    return f'CountRows(Filter(colTkTous, \'Ticket clôturer\'.Value = "{val}"))'


kpis = kpi_row("tkKpis", [
    kpi(P, "Total", "Tous", "📊", "#001E62", "CountRows(colTkTous)", "IsBlank(varKpi)", "Set(varKpi, Blank())"),
    kpi(P, "Ouverts", "Ouverts", "📋", "#0F6CBD", nb_tk("Non"), 'varKpi = "Non"',
        'Set(varKpi, If(varKpi = "Non", Blank(), "Non"))'),
    kpi(P, "EnCours", "En cours", "⏳", "#B97A00", nb_tk("En cours"), 'varKpi = "En cours"',
        'Set(varKpi, If(varKpi = "En cours", Blank(), "En cours"))'),
    kpi(P, "Clotures", "Clôturés", "✅", "#107C10", nb_tk("Oui"), 'varKpi = "Oui"',
        'Set(varKpi, If(varKpi = "Oui", Blank(), "Oui"))'),
])

vide = label("tkAucunTicket", '"Aucun ticket ne correspond à votre recherche."', Height=60,
             AlignInContainer="AlignInContainer.Stretch", Align="Align.Center", Size=13, Color=TXT3,
             Visible="CountRows(tkGalerie.AllItems) = 0", VerticalAlign="VerticalAlign.Middle")

col_liste = auto("tkColonneListe", "Vertical", [kpis, filters, vide, gallery],
                 FillPortions=3, LayoutMinWidth=ph(0, 360), AlignInContainer="AlignInContainer.Stretch",
                 LayoutGap=ph(10, 14), Visible=f"!({PH} && varDetail)")

vt = "varTicket"
details_html = code("""=With(
    {t: varTicket},
    "<div style='font-family:Segoe UI,sans-serif;font-size:13px;color:#1B1B1F'>" &
    "<table style='width:100%;border-collapse:collapse'>" &
    Concat(
        Table(
            {k: "Demandeur", v: t.Author.DisplayName},
            {k: "Date de la demande", v: Text(t.'Date de la demande', "dd/mm/yyyy") & " " & t.'Heure ticket'},
            {k: "Secteur", v: t.'Secteur demandeur'.Value},
            {k: "Cellule", v: t.'Dans quelle cellule devons nous intervenir ?'.Value},
            {k: "Équipement", v: t.'Intervention sur équipement'.Value},
            {k: "Urgence", v: t.'Statut Urgence'.Value},
            {k: "Pris en charge par", v: t.'Prise en charge'.DisplayName},
            {k: "Heure de clôture", v: t.'Heure cloture du ticket'}
        ),
        "<tr><td style='color:#8A8A94;padding:8px 12px 8px 0;width:40%;border-bottom:1px solid #F0F0F3;vertical-align:top'>" & k &
        "</td><td style='padding:8px 0;border-bottom:1px solid #F0F0F3;font-weight:600'>" & Coalesce(v, "—") & "</td></tr>"
    ) &
    "</table>" &
    Concat(
        Table(
            {k: "Description", v: t.Description},
            {k: "Plan B en attendant l'intervention", v: t.'Plan B en attendant l''intervention'},
            {k: "Résolution de l'intervention", v: t.'Résolution de l''intervention'}
        ),
        If(
            IsBlank(v),
            "",
            "<div style='margin-top:16px'><div style='color:#8A8A94;font-size:12px;margin-bottom:6px'>" & k & "</div>" &
            "<div style='background:#F7F8FA;border:1px solid #EEF0F3;border-radius:8px;padding:10px 12px;line-height:1.5'>" &
            Substitute(Substitute(Substitute(v, "&", "&amp;"), "<", "&lt;"), Char(10), "<br>") & "</div></div>"
        )
    ) &
    "</div>"
)""")

photos = [ctrl(f"tkPhoto{n}", IMAGE, {
    "Image": f"{vt}.'Photo {n}'.Full", "ImagePosition": "ImagePosition.Fill", "FillPortions": 1,
    "LayoutMinWidth": 60, "AlignInContainer": "AlignInContainer.Stretch",
    "Visible": f"!IsBlank({vt}.'Photo {n}')", "OnSelect": f"Launch({vt}.'Photo {n}'.Full)",
    "BorderColor": BORDER, "BorderThickness": 1,
}) for n in (1, 2, 3)]

detail = auto("tkDetail", "Vertical", [
    auto("tkDetailEntete", "Horizontal", [
        label("tkDetailNumero", f'"TICKET N° " & {vt}.ID', FillPortions=1, Height=28, Size=11,
              FontWeight="FontWeight.Semibold", Color=f"ColorValue({NAVY})", VerticalAlign="VerticalAlign.Middle"),
        ctrl("tkDetailFermer", BUTTON, {
            "Text": '"✕"', "Width": 32, "Height": 32, "LayoutMinWidth": 32, "Size": 13,
            "Fill": TRANSP, "Color": TXT2, "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP,
            "HoverFill": 'ColorValue("#F0F0F3")', "HoverColor": TXT, "HoverBorderColor": TRANSP,
            "PressedFill": 'ColorValue("#E6E8EB")', "PressedColor": TXT, "PressedBorderColor": TRANSP,
            "OnSelect": "Set(varDetail, false)", **radius(16),
        }),
    ], Height=32, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
        LayoutAlignItems="LayoutAlignItems.Center"),
    label("tkDetailTitre", titre(vt), Height=54, AlignInContainer="AlignInContainer.Stretch", Size=ph(16, 18),
          FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Top"),
    auto("tkDetailBadges", "Horizontal", [
        badge("tkDetailStatut", statut_txt(vt), statut_fill(vt), statut_color(vt), 110),
        badge("tkDetailUrgence", urg_txt(vt), urg_fill(vt), urg_color(vt), 130),
    ], Height=26, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8),
    auto("tkDetailPhotos", "Horizontal", photos, Height=ph(100, 130), FillPortions=0,
         AlignInContainer="AlignInContainer.Stretch", LayoutGap=8,
         Visible=f"!IsBlank({vt}.'Photo 1') || !IsBlank({vt}.'Photo 2') || !IsBlank({vt}.'Photo 3')"),
    ctrl("tkDetailInfos", HTML, {
        "HtmlText": details_html, "AutoHeight": "false", "FillPortions": 1, "LayoutMinHeight": 120,
        "AlignInContainer": "AlignInContainer.Stretch",
    }),
], FillPortions=2, LayoutMinWidth=ph(0, 340), AlignInContainer="AlignInContainer.Stretch", Visible="varDetail",
    LayoutGap=12, PaddingTop=ph(14, 20), PaddingBottom=ph(14, 20), PaddingLeft=ph(14, 20),
    PaddingRight=ph(14, 20), **CARD)

corps = auto("tkCorps", "Horizontal", [col_liste, detail], FillPortions=1,
             AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=16,
             PaddingTop=ph(10, 20), PaddingBottom=ph(10, 20), PaddingLeft=ph(10, 24), PaddingRight=ph(10, 24))

racine_tk = auto("tkRacine", "Vertical", header(P, "Tickets") + [corps],
                 X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Fill=BG, LayoutGap=0)

screen_tickets = {"Screens": {"scrTickets": {
    "Properties": {"Fill": f(BG), "OnVisible": code(f"=Refresh({LIST});\nClearCollect(colTkTous, {LIST})")},
    "Children": [racine_tk],
}}}


# ======================================================================
#  ÉCRAN TABLEAU DE BORD
# ======================================================================
P = "db"
on_visible = code("""=ClearCollect(colDbTickets, {{LIST}});
Set(varDbTotal, CountRows(colDbTickets));
ClearCollect(
    colDbStatut,
    {Libelle: "Ouverts", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "Non")), Couleur: "#0F6CBD"},
    {Libelle: "En cours", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "En cours")), Couleur: "#F7A600"},
    {Libelle: "Clôturés", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "Oui")), Couleur: "#107C10"}
);
ClearCollect(
    colDbDonut,
    ForAll(
        Sequence(CountRows(colDbStatut)) As i,
        With(
            {r: Index(colDbStatut, i.Value), t: Max(varDbTotal, 1)},
            {
                Couleur: r.Couleur,
                Pct: r.Nombre / t * 100,
                Debut: Coalesce(Sum(FirstN(colDbStatut, i.Value - 1), Nombre), 0) / t * 100
            }
        )
    )
);
ClearCollect(
    colDbMois,
    ForAll(
        Sequence(6, 5, -1) As s,
        With(
            {d: DateAdd(Date(Year(Today()), Month(Today()), 1), -s.Value, TimeUnit.Months)},
            {
                Idx: 5 - s.Value,
                Libelle: Text(d, "mmm", "fr-FR"),
                Nombre: CountRows(Filter(colDbTickets, Year(Created) = Year(d) && Month(Created) = Month(d)))
            }
        )
    )
);
ClearCollect(
    colDbUrgence,
    ForAll(
        Distinct(colDbTickets, 'Statut Urgence'.Value) As U,
        {
            Libelle: Coalesce(U.Value, "Non renseigné"),
            Nombre: CountRows(Filter(colDbTickets, 'Statut Urgence'.Value = U.Value)),
            Couleur: If(StartsWith(U.Value, "High"), "#D13438", StartsWith(U.Value, "Medium"), "#F7A600", "#13A10E")
        }
    )
);
ClearCollect(
    colDbSecteur,
    Sort(
        ForAll(
            Distinct(colDbTickets, 'Secteur demandeur'.Value) As S,
            {
                Libelle: Coalesce(S.Value, "Non renseigné"),
                Nombre: CountRows(Filter(colDbTickets, 'Secteur demandeur'.Value = S.Value)),
                Couleur: "#001E62"
            }
        ),
        Nombre,
        SortOrder.Descending
    )
);
ClearCollect(
    colDbEquipement,
    FirstN(
        Sort(
            ForAll(
                Distinct(colDbTickets, 'Intervention sur équipement'.Value) As E,
                {
                    Libelle: Coalesce(E.Value, "Non renseigné"),
                    Nombre: CountRows(Filter(colDbTickets, 'Intervention sur équipement'.Value = E.Value)),
                    Couleur: "#4F6BED"
                }
            ),
            Nombre,
            SortOrder.Descending
        ),
        6
    )
)""", LIST=LIST)


def bars(col):
    return code("""=With(
    {m: Max(Coalesce(Max({{COL}}, Nombre), 0), 1)},
    "<div style='font-family:Segoe UI,sans-serif;font-size:12px'>" &
    Concat(
        {{COL}},
        "<table style='width:100%;border-collapse:collapse;margin-top:12px'><tr>" &
        "<td style='color:#424242'>" & Libelle & "</td>" &
        "<td style='text-align:right;font-weight:600;color:#1B1B1F'>" & Nombre & "</td></tr></table>" &
        "<div style='background:#EEF1F5;border-radius:6px;height:10px;margin-top:4px'>" &
        "<div style='width:" & Round(Nombre / m * 100, 0) & "%;min-width:4px;background:" & Couleur &
        ";height:10px;border-radius:6px'></div></div>"
    ) &
    If(CountRows({{COL}}) = 0, "<div style='color:#8A8A94;padding:12px 0'>Aucune donnée</div>", "") &
    "</div>"
)""", COL=col)


donut_svg = code("""="data:image/svg+xml;utf8," & EncodeUrl(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 42 42'>" &
    "<circle cx='21' cy='21' r='15.915' fill='none' stroke='#EEF1F5' stroke-width='6'/>" &
    Concat(
        Filter(colDbDonut, Pct > 0),
        "<circle cx='21' cy='21' r='15.915' fill='none' stroke='" & Couleur & "' stroke-width='6' stroke-dasharray='" &
        Text(Pct, "0.00", "en-US") & " " & Text(100 - Pct, "0.00", "en-US") &
        "' stroke-dashoffset='" & Text(25 - Debut, "0.00", "en-US") & "'/>"
    ) &
    "<text x='21' y='22' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='8' font-weight='700' fill='#1B1B1F'>" &
    varDbTotal & "</text>" &
    "<text x='21' y='28' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='3.4' fill='#8A8A94'>tickets</text>" &
    "</svg>"
)""")

donut_legende = code("""="<div style='font-family:Segoe UI,sans-serif;font-size:13px;color:#1B1B1F'>" &
Concat(
    colDbStatut,
    "<div style='margin:10px 0'><span style='display:inline-block;width:12px;height:12px;border-radius:6px;background:" &
    Couleur & ";margin-right:8px;vertical-align:middle'></span>" & Libelle &
    "<span style='float:right;font-weight:600'>" & Nombre & "  <span style='color:#8A8A94;font-weight:400'>(" &
    Round(Nombre / Max(varDbTotal, 1) * 100, 0) & " %)</span></span></div>"
) &
"</div>\"""")

mois_svg = code("""=With(
    {m: Max(Coalesce(Max(colDbMois, Nombre), 0), 1)},
    "data:image/svg+xml;utf8," & EncodeUrl(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 170' font-family='Segoe UI,sans-serif'>" &
        "<line x1='10' y1='140' x2='310' y2='140' stroke='#E6E8EB' stroke-width='1'/>" &
        Concat(
            colDbMois,
            With(
                {h: Round(Nombre / m * 105, 0), x: 22 + Idx * 50},
                "<rect x='" & x & "' y='" & (140 - h) & "' width='32' height='" & h & "' rx='6' fill='" &
                If(Idx = 5, "#001E62", "#9DB0D9") & "'/>" &
                "<text x='" & (x + 16) & "' y='" & (133 - h) & "' text-anchor='middle' font-size='12' font-weight='600' fill='#1B1B1F'>" &
                Nombre & "</text>" &
                "<text x='" & (x + 16) & "' y='160' text-anchor='middle' font-size='11' fill='#8A8A94'>" & Libelle & "</text>"
            )
        ) &
        "</svg>"
    )
)""")

urgents_html = code("""=With(
    {u: FirstN(SortByColumns(Filter(colDbTickets, StartsWith('Statut Urgence'.Value, "High") && 'Ticket clôturer'.Value <> "Oui"), "Created", SortOrder.Descending), 6)},
    "<div style='font-family:Segoe UI,sans-serif;font-size:12px;color:#1B1B1F'>" &
    Concat(
        u,
        "<div style='padding:8px 10px;margin-top:8px;background:#FDF3F4;border-left:4px solid #D13438;border-radius:6px'>" &
        "<b>#" & ID & "</b>  ·  " & Substitute(Coalesce(Title, Description, "Ticket sans titre"), "<", "&lt;") &
        "<br><span style='color:#8A8A94'>" & Coalesce('Intervention sur équipement'.Value, "—") & "  ·  " &
        Coalesce('Secteur demandeur'.Value, "—") & "  ·  " & Text(Created, "dd/mm/yyyy") & "</span></div>"
    ) &
    If(CountRows(u) = 0, "<div style='color:#107C10;padding:12px 0'>✅ Aucun ticket urgent en attente</div>", "") &
    "</div>"
)""")


def chart_card(key, titre_txt, body):
    return auto(f"dbGraph{key}", "Vertical", [
        label(f"dbGraph{key}Titre", f'"{titre_txt}"', Height=24, AlignInContainer="AlignInContainer.Stretch",
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    ] + body, FillPortions=1, LayoutMinWidth=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=6,
        PaddingTop=16, PaddingBottom=16, PaddingLeft=18, PaddingRight=18, **CARD)


def html_body(name, formula):
    return [ctrl(name, HTML, {"HtmlText": formula, "AutoHeight": "false", "FillPortions": 1,
                              "LayoutMinHeight": 60, "AlignInContainer": "AlignInContainer.Stretch"})]


H = 290


def chart_row(name, cards):
    return auto(name, "Horizontal", cards,
                LayoutDirection=f"If({PH}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
                Height=ph(2 * H + 16, H), FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
                LayoutGap=16)


def nb_db(lib):
    return f'Coalesce(LookUp(colDbStatut, Libelle = "{lib}").Nombre, 0)'


donut_card = chart_card("Statut", "Répartition par statut", [
    auto("dbDonutZone", "Horizontal", [
        ctrl("dbDonut", IMAGE, {"Image": donut_svg, "ImagePosition": "ImagePosition.Fit", "Width": 170,
                                "Height": 170, "LayoutMinWidth": 150,
                                "AlignInContainer": "AlignInContainer.Center"}),
        ctrl("dbDonutLegende", HTML, {"HtmlText": donut_legende, "AutoHeight": "false", "FillPortions": 1,
                                      "LayoutMinHeight": 60, "AlignInContainer": "AlignInContainer.Center",
                                      "Height": 140}),
    ], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutAlignItems="LayoutAlignItems.Center",
        LayoutGap=16),
])

mois_card = chart_card("Mois", "Tickets créés par mois", [
    ctrl("dbMois", IMAGE, {"Image": mois_svg, "ImagePosition": "ImagePosition.Fit", "FillPortions": 1,
                           "LayoutMinHeight": 120, "AlignInContainer": "AlignInContainer.Stretch"}),
])

db_kpis = kpi_row("dbKpis", [
    kpi(P, "Total", "Tickets au total", "📊", "#001E62", "varDbTotal"),
    kpi(P, "Ouverts", "Ouverts", "📋", "#0F6CBD", nb_db("Ouverts")),
    kpi(P, "EnCours", "En cours", "⏳", "#B97A00", nb_db("En cours")),
    kpi(P, "Taux", "Taux de clôture", "✅", "#107C10",
        f'If(varDbTotal = 0, "—", Round({nb_db("Clôturés")} / varDbTotal * 100, 0) & " %")'),
])

db_corps = auto("dbCorps", "Vertical", [
    label("dbTitre", '"Tableau de bord"', Height=32, AlignInContainer="AlignInContainer.Stretch", Size=ph(18, 20),
          FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    label("dbSousTitre", '"Vue d\'ensemble des tickets de maintenance"', Height=20,
          AlignInContainer="AlignInContainer.Stretch", Size=12, Color=TXT2, VerticalAlign="VerticalAlign.Middle"),
    db_kpis,
    chart_row("dbLigne1", [donut_card, mois_card]),
    chart_row("dbLigne2", [chart_card("Urgence", "Tickets par urgence", html_body("dbUrgenceBarres", bars("colDbUrgence"))),
                           chart_card("Secteur", "Tickets par secteur demandeur",
                                      html_body("dbSecteurBarres", bars("colDbSecteur")))]),
    chart_row("dbLigne3", [chart_card("Equipement", "Équipements les plus concernés",
                                      html_body("dbEquipementBarres", bars("colDbEquipement"))),
                           chart_card("Urgents", "🚨 Urgences à traiter", html_body("dbUrgentsListe", urgents_html))]),
], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=16,
    LayoutOverflowY="LayoutOverflow.Scroll",
    PaddingTop=ph(12, 20), PaddingBottom=24, PaddingLeft=ph(12, 24), PaddingRight=ph(12, 24))

racine_db = auto("dbRacine", "Vertical", header(P, "Tableau de bord") + [db_corps],
                 X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Fill=BG, LayoutGap=0)

screen_db = {"Screens": {"scrTableauBord": {
    "Properties": {"Fill": f(BG), "OnVisible": on_visible},
    "Children": [racine_db],
}}}


# ======================================================================
#  ÉCRAN NOUVEAU TICKET
# ======================================================================
P = "nv"
conseils_html = Block("""="<div style='font-family:Segoe UI,sans-serif;font-size:12px;color:#424242;line-height:1.6'>" &
"<div style='font-weight:600;color:#1B1B1F;margin:4px 0 6px'>Niveau d'urgence</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#D13438;margin-right:8px'></span><b>High</b> : activité à l'arrêt</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#F7A600;margin-right:8px'></span><b>Medium</b> : ralentissement de l'activité</div>" &
"<div><span style='display:inline-block;width:10px;height:10px;border-radius:5px;background:#13A10E;margin-right:8px'></span><b>Low</b> : n'impacte pas l'activité</div>" &
"<div style='font-weight:600;color:#1B1B1F;margin:14px 0 6px'>Pour un traitement rapide</div>" &
"<ul style='margin:0;padding-left:18px'>" &
"<li>Ajoutez au moins une photo de l'équipement.</li>" &
"<li>Précisez la cellule et l'équipement concernés.</li>" &
"<li>Indiquez un plan B si l'activité est bloquée.</li>" &
"</ul></div>\"""")

it = "ThisItem"
mes_card = manual("nvMesTicketsCarte", [
    label("nvMesTicketsTitre", titre(it), X=12, Y=8, Width="Parent.Width - 124", Height=22, Size=12,
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false"),
    label("nvMesTicketsInfo", f'"#" & {it}.ID & "  ·  " & Text({it}.Created, "dd/mm/yyyy")', X=12, Y=30,
          Width="Parent.Width - 124", Height=18, Size=11, Color=TXT3, Wrap="false"),
    badge("nvMesTicketsStatut", statut_txt(it), statut_fill(it), statut_color(it), 96,
          X="Parent.Width - 106", Y=15),
    overlay_button("nvMesTicketsClic", Block(
        "=Set(varTicket, ThisItem);\nSet(varDetail, true);\nNavigate(scrTickets, ScreenTransition.Fade)"), r=10),
], X=0, Y=0, Width="Parent.TemplateWidth", Height="Parent.TemplateHeight - 8",
    Fill='ColorValue("#F7F8FA")', BorderColor='ColorValue("#EEF0F3")', BorderThickness=1, **radius(10))

carte_pad = dict(PaddingTop=16, PaddingBottom=16, PaddingLeft=18, PaddingRight=18)

colonne_aide = auto("nvColonneAide", "Vertical", [
    auto("nvCarteConseils", "Vertical", [
        label("nvConseilsTitre", '"💡  Avant d\'envoyer"', Height=24, AlignInContainer="AlignInContainer.Stretch",
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        ctrl("nvConseilsTexte", HTML, {"HtmlText": conseils_html, "AutoHeight": "false", "FillPortions": 1,
                                       "LayoutMinHeight": 100, "AlignInContainer": "AlignInContainer.Stretch"}),
    ], Height=290, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=6, **CARD, **carte_pad),
    auto("nvCarteMesTickets", "Vertical", [
        label("nvMesTicketsEntete", '"🕘  Mes derniers tickets"', Height=24,
              AlignInContainer="AlignInContainer.Stretch", Size=14, FontWeight="FontWeight.Semibold",
              Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        label("nvMesTicketsVide", '"Vous n\'avez encore créé aucun ticket."', Height=40,
              AlignInContainer="AlignInContainer.Stretch", Size=12, Color=TXT3,
              Visible="CountRows(nvMesTickets.AllItems) = 0", VerticalAlign="VerticalAlign.Middle"),
        ctrl("nvMesTickets", GALLERY, {
            "Items": f'FirstN(SortByColumns(Filter({LIST}, Author.Email = User().Email), "Created", SortOrder.Descending), 5)',
            "TemplateSize": 64, "TemplatePadding": 0, "ShowScrollbar": "false", "FillPortions": 1,
            "LayoutMinHeight": 0, "AlignInContainer": "AlignInContainer.Stretch",
        }, [mes_card], variant="Vertical"),
    ], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8, **CARD, **carte_pad),
], FillPortions=1, LayoutMinWidth=280, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16,
    Visible="App.Width >= 1000")

carte_formulaire = auto("nvCarteFormulaire", "Vertical", None, FillPortions=3, LayoutMinWidth=0,
                        AlignInContainer="AlignInContainer.Stretch", PaddingTop=8, PaddingBottom=8,
                        PaddingLeft=8, PaddingRight=8, **CARD)

bandeau = auto("nvBandeau", "Horizontal", [
    label("nvBandeauTexte", '"✅  Ticket n° " & varNumTicket & " envoyé avec succès. L\'équipe maintenance a été prévenue."',
          FillPortions=1, Height=40, Size=ph(12, 13), FontWeight="FontWeight.Semibold",
          Color='ColorValue("#0E700E")', VerticalAlign="VerticalAlign.Middle"),
    ctrl("nvBandeauFermer", BUTTON, {
        "Text": '"✕"', "Width": 32, "Height": 32, "LayoutMinWidth": 32, "Size": 12,
        "Fill": TRANSP, "Color": 'ColorValue("#0E700E")', "BorderStyle": "BorderStyle.None",
        "BorderColor": TRANSP, "HoverFill": 'ColorValue("#CDEFCB")', "HoverColor": 'ColorValue("#0E700E")',
        "HoverBorderColor": TRANSP, "PressedFill": 'ColorValue("#BFE8BC")', "PressedColor": 'ColorValue("#0E700E")',
        "PressedBorderColor": TRANSP, "OnSelect": "Set(varMsgNv, false)", **radius(16),
    }),
], Height=52, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", Visible="varMsgNv",
    Fill='ColorValue("#DFF6DD")', BorderColor='ColorValue("#9FD89F")', BorderThickness=1,
    LayoutAlignItems="LayoutAlignItems.Center", PaddingLeft=16, PaddingRight=8, **radius(10))

actions = auto("nvActions", "Horizontal", [
    label("nvActionsAide", '"Les champs marqués d\'un * sont obligatoires."', FillPortions=1, Height=36,
          LayoutMinWidth=0, Size=12, Color=TXT3, VerticalAlign="VerticalAlign.Middle", Visible=NOT_PH),
    auto("nvActionsEspace", "Horizontal", None, FillPortions=ph(1, 0), Width=1, Height=10, Visible=PH),
    button("nvEffacer", "Effacer", Block("=ResetForm(Form1);\nNewForm(Form1);\nSet(varMsgNv, false)"), ph(100, 120)),
    button("nvEnvoyer", "Envoyer le ticket", "SubmitForm(Form1)", ph(150, 170), primary=True,
           DisplayMode="If(Form1.Valid, DisplayMode.Edit, DisplayMode.Disabled)",
           DisabledFill='ColorValue("#C7CFDF")', DisabledColor='ColorValue("#FFFFFF")',
           DisabledBorderColor='ColorValue("#C7CFDF")'),
], Height=64, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
    LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=10, PaddingLeft=ph(12, 18), PaddingRight=ph(12, 14),
    **CARD)

nv_corps = auto("nvCorps", "Vertical", [
    label("nvTitre", '"Nouveau ticket"', Height=32, AlignInContainer="AlignInContainer.Stretch", Size=ph(18, 20),
          FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    label("nvSousTitre", '"Décrivez le problème : l\'équipe maintenance sera prévenue dès l\'envoi."', Height=ph(36, 20),
          AlignInContainer="AlignInContainer.Stretch", Size=12, Color=TXT2, VerticalAlign="VerticalAlign.Middle"),
    bandeau,
    auto("nvContenu", "Horizontal", [carte_formulaire, colonne_aide], FillPortions=1,
         AlignInContainer="AlignInContainer.Stretch", LayoutGap=16),
    actions,
], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=ph(10, 14),
    PaddingTop=ph(12, 20), PaddingBottom=ph(10, 20), PaddingLeft=ph(10, 24), PaddingRight=ph(10, 24))

racine_nv = auto("nvRacine", "Vertical", header(P, "Nouveau ticket") + [nv_corps],
                 X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Fill=BG, LayoutGap=0)

screen_nv = {"Screens": {"scrNouveauTicket": {
    "Properties": {"Fill": f(BG), "OnVisible": f("Set(varMsgNv, false)")},
    "Children": [racine_nv],
}}}


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        yaml.dump(obj, fh, sort_keys=False, allow_unicode=True, width=10000, default_flow_style=False)


dump(screen_tickets, f"{OUT}/1-Ecran-Tickets.pa.yaml")
dump(screen_db, f"{OUT}/2-Ecran-TableauDeBord.pa.yaml")
dump(screen_nv, f"{OUT}/3-Ecran-NouveauTicket.pa.yaml")
print("ok")
