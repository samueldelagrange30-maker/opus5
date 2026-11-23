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
    style = "|" if ("\n" in data) else None
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


# ---------------------------------------------------------------- en-tête
NAV = [
    ("Tickets", "Navigate(scrTickets, ScreenTransition.Fade)", 110),
    ("Nouveau ticket", "NewForm(Form1);\nNavigate('Nouveau Ticket', ScreenTransition.Fade)", 140),
    ("Tableau de bord", "Navigate(scrTableauBord, ScreenTransition.Fade)", 150),
]


def header(p, active):
    kids = [
        label(f"{p}Logo", '"ASICS"', Width=82, Height=40, LayoutMinWidth=82, Size=20,
              FontWeight="FontWeight.Bold", Italic="true", Color=f"ColorValue({NAVY})",
              VerticalAlign="VerticalAlign.Middle"),
        label(f"{p}NomApp", '"Ticket de maintenance"', Width=210, Height=40, LayoutMinWidth=160,
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        auto(f"{p}Espace", "Horizontal", None, FillPortions=1, Height=10),
    ]
    for i, (txt, nav, w) in enumerate(NAV):
        on = txt == active
        kids.append(ctrl(f"{p}Nav{i + 1}", BUTTON, {
            "Text": f'"{txt}"', "Width": w, "Height": 36, "LayoutMinWidth": w, "Size": 12,
            "FontWeight": "FontWeight.Semibold",
            "Fill": 'ColorValue("#E8EDF7")' if on else TRANSP,
            "Color": f"ColorValue({NAVY})" if on else TXT2,
            "BorderStyle": "BorderStyle.None", "BorderColor": TRANSP, "HoverBorderColor": TRANSP,
            "PressedBorderColor": TRANSP, "HoverFill": 'ColorValue("#EEF1F7")',
            "HoverColor": f"ColorValue({NAVY})", "PressedFill": 'ColorValue("#E3E9F5")',
            "PressedColor": f"ColorValue({NAVY})", **radius(8),
            "OnSelect": Block(nav) if "\n" in nav else nav,
        }))
    kids.append(label(f"{p}Utilisateur", "User().FullName", Width=170, Height=40, LayoutMinWidth=120,
                      Size=12, Color=TXT2, Align="Align.Right", VerticalAlign="VerticalAlign.Middle"))
    return [
        auto(f"{p}Entete", "Horizontal", kids, Fill=WHITE, Height=64, FillPortions=0,
             AlignInContainer="AlignInContainer.Stretch", LayoutAlignItems="LayoutAlignItems.Center",
             LayoutGap=8, PaddingLeft=24, PaddingRight=24),
        ctrl(f"{p}Separateur", RECT, {"Fill": BORDER, "Height": 1,
                                       "AlignInContainer": "AlignInContainer.Stretch"}),
    ]


# ---------------------------------------------------------------- carte KPI
def kpi(p, key, titre, emoji, color, value, selected="false", onselect=None):
    c = f'ColorValue("{color}")'
    kids = [
        manual(f"{p}Kpi{key}Pastille", [
            label(f"{p}Kpi{key}Emoji", f'"{emoji}"', X=0, Y=0, Width=44, Height=44, Size=18,
                  Align="Align.Center", VerticalAlign="VerticalAlign.Middle"),
        ], X=16, Y="(Parent.Height - 44) / 2", Width=44, Height=44,
            Fill=f"ColorFade({c}, 0.85)", **radius(22)),
        label(f"{p}Kpi{key}Valeur", value, X=72, Y="Parent.Height / 2 - 28", Width="Parent.Width - 84",
              Height=32, Size=22, FontWeight="FontWeight.Bold", Color=c,
              VerticalAlign="VerticalAlign.Middle"),
        label(f"{p}Kpi{key}Titre", f'"{titre}"', X=72, Y="Parent.Height / 2 + 4", Width="Parent.Width - 84",
              Height=20, Size=12, FontWeight="FontWeight.Semibold", Color=TXT2, Wrap="false",
              VerticalAlign="VerticalAlign.Middle"),
    ]
    if onselect:
        kids.append(overlay_button(f"{p}Kpi{key}Clic", onselect))
    return manual(f"{p}Kpi{key}", kids, FillPortions=1, LayoutMinWidth=130,
                  AlignInContainer="AlignInContainer.Stretch",
                  Fill=f"If({selected}, ColorFade({c}, 0.93), {WHITE})",
                  BorderColor=f"If({selected}, {c}, {BORDER})",
                  BorderThickness=f"If({selected}, 2, 1)",
                  DropShadow="DropShadow.Light", **radius(12))


# ---------------------------------------------------------------- formules statut / urgence
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
    k = urg_key(it)
    return f'ColorValue(Switch({k}, "High", "#A4262C", "Medium", "#8A6100", "Low", "#107C10", "#5C5C66"))'


def urg_fill(it):
    k = urg_key(it)
    return f'ColorValue(Switch({k}, "High", "#FDE7E9", "Medium", "#FFF4CE", "Low", "#DFF6DD", "#F0F0F3"))'


def urg_bar(it):
    k = urg_key(it)
    return f'ColorValue(Switch({k}, "High", "#D13438", "Medium", "#F7A600", "Low", "#13A10E", "#C8CCD2"))'


def badge(name, text, fill, color, width, **p):
    return manual(name, [
        label(f"{name}Txt", text, X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Size=11,
              FontWeight="FontWeight.Semibold", Color=color, Align="Align.Center",
              VerticalAlign="VerticalAlign.Middle"),
    ], Width=width, Height=26, LayoutMinWidth=width, Fill=fill, **radius(13), **p)


# ================================================================ ÉCRAN TICKETS
P = "tk"
gal_items = Block(f"""SortByColumns(
    Filter(
        {LIST},
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
)""")

it = "ThisItem"
sel_card = "varDetail && ThisItem.ID = varTicket.ID"
card = manual("tkCarte", [
    ctrl("tkCarteBarre", RECT, {"X": 0, "Y": 0, "Width": 5, "Height": "Parent.Height", "Fill": urg_bar(it)}),
    label("tkCarteNum", f'"#" & {it}.ID & "  ·  " & Text({it}.\'Date de la demande\', "dd/mm/yyyy") & " " & {it}.\'Heure ticket\'',
          X=20, Y=12, Width="Parent.Width - 170", Height=18, Size=11, Color=TXT3, Wrap="false"),
    label("tkCarteTitre", f"{it}.Title", X=20, Y=32, Width="Parent.Width - 170", Height=26, Size=15,
          FontWeight="FontWeight.Semibold", Color=TXT, Wrap="false"),
    label("tkCarteInfos",
          f"Coalesce({it}.'Secteur demandeur'.Value, \"—\") & \"  ·  \" & Coalesce({it}.'Intervention sur équipement'.Value, \"—\") & \"  ·  \" & Coalesce({it}.'Dans quelle cellule devons nous intervenir ?'.Value, \"—\")",
          X=20, Y=60, Width="Parent.Width - 170", Height=20, Size=12, Color=TXT2, Wrap="false"),
    label("tkCarteAuteur",
          f"\"Par \" & {it}.Author.DisplayName & If(IsBlank({it}.'Prise en charge'.DisplayName), \"\", \"  ·  Pris en charge par \" & {it}.'Prise en charge'.DisplayName)",
          X=20, Y=82, Width="Parent.Width - 170", Height=18, Size=11, Color=TXT3, Wrap="false"),
    badge("tkCarteStatut", statut_txt(it), statut_fill(it), statut_color(it), 128,
          X="Parent.Width - 144", Y=14),
    badge("tkCarteUrgence", urg_txt(it), urg_fill(it), urg_color(it), 128,
          X="Parent.Width - 144", Y=48),
    overlay_button("tkCarteClic", "Set(varTicket, ThisItem);\nSet(varDetail, true)"),
], X=0, Y=0, Width="Parent.TemplateWidth - 12", Height="Parent.TemplateHeight - 10",
    Fill=WHITE, BorderColor=f"If({sel_card}, ColorValue({NAVY}), {BORDER})",
    BorderThickness=f"If({sel_card}, 2, 1)", DropShadow="DropShadow.Light", **radius(12))
# la formule OnSelect multi-ligne doit être un bloc
card["tkCarte"]["Children"][-1]["tkCarteClic"]["Properties"]["OnSelect"] = Block(
    "=Set(varTicket, ThisItem);\nSet(varDetail, true)")

gallery = ctrl("tkGalerie", GALLERY, {
    "Items": Block("=" + gal_items), "TemplateSize": 122, "TemplatePadding": 0,
    "ShowScrollbar": "true", "FillPortions": 1, "LayoutMinHeight": 0,
    "AlignInContainer": "AlignInContainer.Stretch", "Width": "Parent.Width", "Height": "Parent.Height",
    "LoadingSpinner": "LoadingSpinner.Data",
}, [card], variant="Vertical")

filters = auto("tkFiltres", "Horizontal", [
    ctrl("tkRecherche", TEXTINPUT, {
        "Default": '""', "HintText": '"🔍  Rechercher un ticket, un équipement, un n°…"',
        "DelayOutput": "true", "Height": 36, "FillPortions": 1, "LayoutMinWidth": 160, "Size": 12,
        "Fill": 'ColorValue("#F7F8FA")', "Color": TXT, "BorderColor": BORDER, "BorderThickness": 1,
        "HoverBorderColor": 'ColorValue("#C3C8D0")', "FocusedBorderColor": f"ColorValue({NAVY})",
        "PaddingLeft": 12, **radius(8),
    }),
    ctrl("tkFiltreUrgence", COMBO, {
        "Items": f"Choices({LIST}.'Statut Urgence')", "ItemDisplayText": "ThisItem.Value",
        "SelectMultiple": "false", "IsSearchable": "false", "Appearance": "Appearance.Outline",
        "Width": 200, "Height": 36, "Size": 12, "LayoutMinWidth": 150,
    }),
    ctrl("tkFiltreSecteur", COMBO, {
        "Items": f"Choices({LIST}.'Secteur demandeur')", "ItemDisplayText": "ThisItem.Value",
        "SelectMultiple": "false", "IsSearchable": "false", "Appearance": "Appearance.Outline",
        "Width": 180, "Height": 36, "Size": 12, "LayoutMinWidth": 140,
    }),
    button("tkReinitialiser", "Réinitialiser",
           Block("=Reset(tkRecherche);\nReset(tkFiltreUrgence);\nReset(tkFiltreSecteur);\nSet(varKpi, Blank())"), 120),
], Fill=WHITE, Height=58, FillPortions=0, AlignInContainer="AlignInContainer.Stretch",
    LayoutAlignItems="LayoutAlignItems.Center", LayoutGap=10, PaddingLeft=12, PaddingRight=12,
    BorderColor=BORDER, BorderThickness=1, **radius(12))

kpis = auto("tkKpis", "Horizontal", [
    kpi(P, "Total", "Tous les tickets", "📊", "#001E62", f"CountRows({LIST})",
        "IsBlank(varKpi)", "Set(varKpi, Blank())"),
    kpi(P, "Ouverts", "Ouverts", "📋", "#0F6CBD", f'CountRows(Filter({LIST}, \'Ticket clôturer\'.Value = "Non"))',
        'varKpi = "Non"', 'Set(varKpi, If(varKpi = "Non", Blank(), "Non"))'),
    kpi(P, "EnCours", "En cours", "⏳", "#B97A00", f'CountRows(Filter({LIST}, \'Ticket clôturer\'.Value = "En cours"))',
        'varKpi = "En cours"', 'Set(varKpi, If(varKpi = "En cours", Blank(), "En cours"))'),
    kpi(P, "Clotures", "Clôturés", "✅", "#107C10", f'CountRows(Filter({LIST}, \'Ticket clôturer\'.Value = "Oui"))',
        'varKpi = "Oui"', 'Set(varKpi, If(varKpi = "Oui", Blank(), "Oui"))'),
], Height=92, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=12)

vide = label("tkAucunTicket", '"Aucun ticket ne correspond à votre recherche."', Height=60,
             AlignInContainer="AlignInContainer.Stretch", Align="Align.Center", Size=13, Color=TXT3,
             Visible="CountRows(tkGalerie.AllItems) = 0", VerticalAlign="VerticalAlign.Middle")

col_liste = auto("tkColonneListe", "Vertical", [kpis, filters, vide, gallery],
                 FillPortions=3, LayoutMinWidth=360, AlignInContainer="AlignInContainer.Stretch", LayoutGap=14)

# --- panneau de détail
vt = "varTicket"
details_html = Block("""=With(
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

photos = []
for n in (1, 2, 3):
    photos.append(ctrl(f"tkPhoto{n}", IMAGE, {
        "Image": f"{vt}.'Photo {n}'.Full", "ImagePosition": "ImagePosition.Fill",
        "FillPortions": 1, "LayoutMinWidth": 60, "AlignInContainer": "AlignInContainer.Stretch",
        "Visible": f"!IsBlank({vt}.'Photo {n}')", "OnSelect": f"Launch({vt}.'Photo {n}'.Full)",
        "BorderColor": BORDER, "BorderThickness": 1,
    }))

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
    label("tkDetailTitre", f"{vt}.Title", Height=54, AlignInContainer="AlignInContainer.Stretch", Size=18,
          FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Top"),
    auto("tkDetailBadges", "Horizontal", [
        badge("tkDetailStatut", statut_txt(vt), statut_fill(vt), statut_color(vt), 120),
        badge("tkDetailUrgence", urg_txt(vt), urg_fill(vt), urg_color(vt), 140),
    ], Height=26, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=8),
    auto("tkDetailPhotos", "Horizontal", photos, Height=130, FillPortions=0,
         AlignInContainer="AlignInContainer.Stretch", LayoutGap=8,
         Visible=f"!IsBlank({vt}.'Photo 1') || !IsBlank({vt}.'Photo 2') || !IsBlank({vt}.'Photo 3')"),
    ctrl("tkDetailInfos", HTML, {
        "HtmlText": details_html, "AutoHeight": "false", "FillPortions": 1, "LayoutMinHeight": 120,
        "AlignInContainer": "AlignInContainer.Stretch", "Width": "Parent.Width", "Height": 300,
    }),
], FillPortions=2, LayoutMinWidth=340, AlignInContainer="AlignInContainer.Stretch", Visible="varDetail",
    Fill=WHITE, BorderColor=BORDER, BorderThickness=1, DropShadow="DropShadow.Light",
    PaddingTop=20, PaddingBottom=20, PaddingLeft=20, PaddingRight=20, LayoutGap=12, **radius(12))

corps = auto("tkCorps", "Horizontal", [col_liste, detail], FillPortions=1,
             AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=16,
             PaddingTop=20, PaddingBottom=20, PaddingLeft=24, PaddingRight=24)

racine_tk = auto("tkRacine", "Vertical", header(P, "Tickets") + [corps],
                 X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Fill=BG, LayoutGap=0)

screen_tickets = {"Screens": {"scrTickets": {
    "Properties": {"Fill": f(BG), "OnVisible": f(f"Refresh({LIST})")},
    "Children": [racine_tk],
}}}


# ================================================================ ÉCRAN TABLEAU DE BORD
P = "db"
on_visible = Block(f"""=ClearCollect(colDbTickets, {LIST});
Set(varDbTotal, CountRows(colDbTickets));
ClearCollect(
    colDbStatut,
    {{Libelle: "Ouverts", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "Non")), Couleur: "#0F6CBD"}},
    {{Libelle: "En cours", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "En cours")), Couleur: "#F7A600"}},
    {{Libelle: "Clôturés", Nombre: CountRows(Filter(colDbTickets, 'Ticket clôturer'.Value = "Oui")), Couleur: "#107C10"}}
);
ClearCollect(
    colDbUrgence,
    ForAll(
        Distinct(colDbTickets, 'Statut Urgence'.Value) As U,
        {{
            Libelle: Coalesce(U.Value, "Non renseigné"),
            Nombre: CountRows(Filter(colDbTickets, 'Statut Urgence'.Value = U.Value)),
            Couleur: If(StartsWith(U.Value, "High"), "#D13438", StartsWith(U.Value, "Medium"), "#F7A600", "#13A10E")
        }}
    )
);
ClearCollect(
    colDbSecteur,
    Sort(
        ForAll(
            Distinct(colDbTickets, 'Secteur demandeur'.Value) As S,
            {{
                Libelle: Coalesce(S.Value, "Non renseigné"),
                Nombre: CountRows(Filter(colDbTickets, 'Secteur demandeur'.Value = S.Value)),
                Couleur: "#001E62"
            }}
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
                {{
                    Libelle: Coalesce(E.Value, "Non renseigné"),
                    Nombre: CountRows(Filter(colDbTickets, 'Intervention sur équipement'.Value = E.Value)),
                    Couleur: "#4F6BED"
                }}
            ),
            Nombre,
            SortOrder.Descending
        ),
        6
    )
)""")


def bars(col):
    return Block(f"""=With(
    {{m: Max(Coalesce(Max({col}, Nombre), 0), 1)}},
    "<div style='font-family:Segoe UI,sans-serif;font-size:12px'>" &
    Concat(
        {col},
        "<table style='width:100%;border-collapse:collapse;margin-top:12px'><tr>" &
        "<td style='color:#424242'>" & Libelle & "</td>" &
        "<td style='text-align:right;font-weight:600;color:#1B1B1F'>" & Nombre & "</td></tr></table>" &
        "<div style='background:#EEF1F5;border-radius:6px;height:10px;margin-top:4px'>" &
        "<div style='width:" & Round(Nombre / m * 100, 0) & "%;min-width:4px;background:" & Couleur &
        ";height:10px;border-radius:6px'></div></div>"
    ) &
    If(CountRows({col}) = 0, "<div style='color:#8A8A94;padding:12px 0'>Aucune donnée</div>", "") &
    "</div>"
)""")


def chart(key, titre, col):
    return auto(f"dbGraph{key}", "Vertical", [
        label(f"dbGraph{key}Titre", f'"{titre}"', Height=24, AlignInContainer="AlignInContainer.Stretch",
              Size=14, FontWeight="FontWeight.Semibold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
        ctrl(f"dbGraph{key}Barres", HTML, {
            "HtmlText": bars(col), "AutoHeight": "false", "FillPortions": 1, "LayoutMinHeight": 80,
            "AlignInContainer": "AlignInContainer.Stretch", "Width": "Parent.Width", "Height": 200,
        }),
    ], FillPortions=1, LayoutMinWidth=260, AlignInContainer="AlignInContainer.Stretch", Fill=WHITE,
        BorderColor=BORDER, BorderThickness=1, DropShadow="DropShadow.Light", LayoutGap=6,
        PaddingTop=16, PaddingBottom=16, PaddingLeft=18, PaddingRight=18, **radius(12))


def nb(lib):
    return f'Coalesce(LookUp(colDbStatut, Libelle = "{lib}").Nombre, 0)'


db_kpis = auto("dbKpis", "Horizontal", [
    kpi(P, "Total", "Tickets au total", "📊", "#001E62", "varDbTotal"),
    kpi(P, "Ouverts", "Ouverts", "📋", "#0F6CBD", nb("Ouverts")),
    kpi(P, "EnCours", "En cours", "⏳", "#B97A00", nb("En cours")),
    kpi(P, "Taux", "Taux de clôture", "✅", "#107C10",
        f'If(varDbTotal = 0, "—", Round({nb("Clôturés")} / varDbTotal * 100, 0) & " %")'),
], Height=92, FillPortions=0, AlignInContainer="AlignInContainer.Stretch", LayoutGap=12)

db_corps = auto("dbCorps", "Vertical", [
    label("dbTitre", '"Tableau de bord"', Height=32, AlignInContainer="AlignInContainer.Stretch", Size=20,
          FontWeight="FontWeight.Bold", Color=TXT, VerticalAlign="VerticalAlign.Middle"),
    label("dbSousTitre", '"Vue d\'ensemble des tickets de maintenance"', Height=20,
          AlignInContainer="AlignInContainer.Stretch", Size=12, Color=TXT2, VerticalAlign="VerticalAlign.Middle"),
    db_kpis,
    auto("dbLigne1", "Horizontal", [chart("Statut", "Tickets par statut", "colDbStatut"),
                                    chart("Urgence", "Tickets par urgence", "colDbUrgence")],
         FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16),
    auto("dbLigne2", "Horizontal", [chart("Secteur", "Tickets par secteur demandeur", "colDbSecteur"),
                                    chart("Equipement", "Équipements les plus concernés", "colDbEquipement")],
         FillPortions=1, AlignInContainer="AlignInContainer.Stretch", LayoutGap=16),
], FillPortions=1, AlignInContainer="AlignInContainer.Stretch", Fill=BG, LayoutGap=16,
    PaddingTop=20, PaddingBottom=24, PaddingLeft=24, PaddingRight=24)

racine_db = auto("dbRacine", "Vertical", header(P, "Tableau de bord") + [db_corps],
                 X=0, Y=0, Width="Parent.Width", Height="Parent.Height", Fill=BG, LayoutGap=0)

screen_db = {"Screens": {"scrTableauBord": {
    "Properties": {"Fill": f(BG), "OnVisible": on_visible},
    "Children": [racine_db],
}}}


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        yaml.dump(obj, fh, sort_keys=False, allow_unicode=True, width=10000, default_flow_style=False)


dump(screen_tickets, f"{OUT}/1-Ecran-Tickets.pa.yaml")
dump(screen_db, f"{OUT}/2-Ecran-TableauDeBord.pa.yaml")
print("ok")
