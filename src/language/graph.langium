grammar Graph

entry Model:
    GraphContent
;

fragment GraphContent:
    (elements+=Element | styles+=Style | aliases+=ElementAlias)*
;


Element:
    Graph | Node | Link
;

ElementAlias:
    GraphAlias | NodeAlias | LinkAlias
;

GraphAlias:
    keyword='define'
    name=ID
    element='graph'
    StyleRef?
    definition=StyleBlock?
;

NodeAlias:
    keyword='define'
    name=ID
    element='node'
    StyleRef?
    definition=StyleBlock?
;

LinkAlias:
    keyword='define'
    name=ID
    element='link'
    StyleRef?
    definition=StyleBlock?
;

Graph:
    (alias=[GraphAlias:ID] | keyword='graph')
    StyleRef?
    name=ID
    label=Label?
    '{'
    GraphContent
    '}'
;

Node:
    (alias=[NodeAlias:ID] | keyword='node')
    StyleRef?
    name=ID
    label=Label?
;

Link:
    (alias=[LinkAlias:ID] | keyword='link')
    StyleRef?
    (
        '('
        name=ID
        ')'
    )?
    src+=[Element:ID] ( ',' src+=[Element:ID] )*
    (':' src_arrowhead=ID)?
    LinkConnector
    dst+=[Element:ID] ( ',' dst+=[Element:ID] )*
    (':' dst_arrowhead=ID)?
    label=Label?
;

fragment LinkConnector:
    relation=('to' | 'with') |
    link=LINK_CONNECTOR
;

terminal LINK_CONNECTOR:
    /([xo]|[<][|>]?)?(-{2,}|\.{2,}|={2,}|~{2,}|-\.+-)([xo]|[|<]?[>])?/
;

fragment StyleRef:
    ':' styleref=[Style:ID]
;

Style:
    keyword='style'
    StyleRef?
	name=ID
	definition=StyleBlock
;

StyleBlock:
    (
        '{'
        ';'*
        (
            items+=StyleDefinition
            (';'+ items+=StyleDefinition)* 
            ';'*
        )?
        '}'
    )
;

StyleDefinition:
    LabelStyleDefinition
    | ColorStyleDefinition
    | OpacityStyleDefinition
    | LineStyleDefinition
    | LineWidthDefinition
    | ShapeStyleDefinition
    | ResetStyleDefinition
    | UnknownStyleDefinition
;

LabelStyleDefinition:
    topic=LABEL_STYLE_TOPIC
    ':'
    value=STRING
;
ColorStyleDefinition:
    topic=COLOR_STYLE_TOPIC
    ':'
    value=ColorDefinition
;
OpacityStyleDefinition:
    topic=COLOR_ALPHA_TOPIC
    ':'
    value=OpacityDefinition<true>
;
LineStyleDefinition:
    topic=LINE_STYLE_TOPIC
    ':'
    value=STRING
;
LineWidthDefinition:
    topic=LINE_WIDTH_TOPIC
    ':'
    value=WidthDefinition
;
ShapeStyleDefinition:
    topic=SHAPE_STYLE_TOPIC
    ':'
    value=( STRING | ID )
;
ResetStyleDefinition:
    topic=RESET_STYLE_TOPIC
    ':'
    value=( STRING | ID | '*' )
;
UnknownStyleDefinition:
    topic=ID
    ':'
    value=( STRING | ID )
;


ColorDefinition:
    color=(TextColorDefinition | RgbColorDefinition | HexColorDefinition)
;
TextColorDefinition:
    color_name=ID
;
RgbColorDefinition:
    'rgb(' red=NUMBER ',' green=NUMBER ',' blue=NUMBER')'
;
HexColorDefinition:
    hex_color=HEX_COLOR_DEFINITION
;
terminal HEX_COLOR_DEFINITION:
    /\#[0-9a-f]+/i
;

WidthDefinition:
    width=WidthValue
;
WidthValue:
    value=NUMBER unit=ID? // WIDTH_UNIT
;
terminal WIDTH_UNIT:
    'mm' |
    'cm' |
    'pc' |
    'pt' |
    'em' |
    'ex' |
    'rem'
;

OpacityDefinition<isPct>:
    opacity=NUMBER
    (<isPct> isPct?='%')?
;

terminal COLOR_STYLE_TOPIC:
    'BorderColor' | 'FillColor' | 'LineColor' | 'LabelColor'
;
terminal COLOR_ALPHA_TOPIC:
    'BorderAlpha' | 'FillAlpha' | 'LineAlpha' | 'LabelAlpha' |
    'BorderOpacity' | 'FillOpacity' | 'LineOpacity' | 'LabelOpacity'
;
terminal LABEL_STYLE_TOPIC:
    'LabelText' | 'SrcLabelText' | 'DstLabelText'
;
terminal LINE_STYLE_TOPIC:
    'BorderStyle' | 'LineStyle'
;
terminal LINE_WIDTH_TOPIC:
    'BorderWidth' | 'LineWidth'
;
terminal SHAPE_STYLE_TOPIC:
    'Shape'
;
terminal RESET_STYLE_TOPIC:
    'Reset'
;

Label:
    BracketedLabel | StringLabel;

BracketedLabel:
	//'[' -> ']'
    label_bracketed=BRACKETED_STRING
;
StringLabel:
    label_string=STRING;

terminal BRACKETED_STRING:
    /\[(\\.|[^\]\\])*\]/
;

hidden terminal WS: /\s+/;

terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

terminal NUMBER returns number:
   /(\d*(\.\d+))|\d+/
;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
