grammar Graph

entry Model:
    (elements+=Element | styles+=Style)*
;

Element:
    Graph | Node | Link;

Graph:
    'graph'
    StyleID?
    name=ID
    label=Label?
    '{'
    (elements+=Element | styles+=Style)*
    '}'
;

Node:
    'node'
    StyleID?
    name=ID
    label=Label?
;

Link:
    'link'
    StyleID?
    (
        '('
        name=ID
        ')'
    )?
    src=[Element:ID]
    kind=LinkType
    dst=[Element:ID]
    label=Label?
;

terminal LinkType:
    'to' | 'and' | /[<xo]?(--|\.\.|==|~~)[>xo]?/
;

fragment StyleID:
    ':' style=[Style:ID]
;

Style:
    'style'
	name=ID
	definition=StyleBlock
    // { infer Style }
;

StyleBlock:
    (
        '{}'
    ) | (
        '{'
        ';'* items+=StyleDefinition?
        (';'+ items+=StyleDefinition)* ';'*
        '}'
    )
;

StyleDefinition:
    ColorStyleDefinition
    | OpacityStyleDefinition
    | LabelStyleDefinition
    | LineStyleDefinition
    | ShapeStyleDefinition
    | ResetStyleDefinition
    | UnknownStyleDefinition
;

ColorStyleDefinition:
    topic=COLOR_STYLE_TOPIC
    ':'
    value=( STRING | ID )
;
OpacityStyleDefinition:
    topic=COLOR_ALPHA_TOPIC
    ':'
    value=(STRING|ID)
;
LabelStyleDefinition:
    topic=LABEL_STYLE_TOPIC
    ':'
    value=STRING
;
LineStyleDefinition:
    topic=LINE_STYLE_TOPIC
    ':'
    value=STRING
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

terminal COLOR_STYLE_TOPIC:
    /(Border|Fill|Line|Label)Color/
;
terminal COLOR_ALPHA_TOPIC:
    /(Border|Fill|Line|Label)(Alpha|Opacity)/
;
terminal LABEL_STYLE_TOPIC:
// NOTE: /(Src|Dst)?Label/ will match e.g. 'LabelText' and throw an error
    /(Src|Dst|)(Label)/
;
terminal LINE_STYLE_TOPIC:
    /(Border|Line)(Style|Width)/
;
terminal SHAPE_STYLE_TOPIC:
    /Shape/
;
terminal RESET_STYLE_TOPIC:
    /Reset/
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
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
