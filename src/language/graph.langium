grammar Graph

entry Model:
    (elements+=Element | styles+=Style)*
    ;

Element: Graph | Node | Link;

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
    topic=ID
    ':'
    value=STRING
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
