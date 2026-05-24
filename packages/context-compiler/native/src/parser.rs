use serde::Serialize;
use tree_sitter::{Language, Node, Parser};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ParsedSymbol {
    pub name: String,
    pub kind: String,
    pub start_line: u32,
    pub end_line: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ParsedImport {
    pub source: String,
    pub target: String,
    pub is_external: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ParsedFile {
    pub path: String,
    pub language: String,
    pub symbols: Vec<ParsedSymbol>,
    pub imports: Vec<ParsedImport>,
    pub has_error: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ParseError {
    UnsupportedLanguage(String),
    LanguageLoadFailed(String),
    ParseFailed,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::UnsupportedLanguage(language) => {
                write!(formatter, "unsupported language: {language}")
            }
            ParseError::LanguageLoadFailed(language) => {
                write!(formatter, "failed to load parser for {language}")
            }
            ParseError::ParseFailed => formatter.write_str("failed to parse source"),
        }
    }
}

impl std::error::Error for ParseError {}

pub fn parse_workspace_file(
    path: &str,
    language_hint: Option<&str>,
    content: &str,
) -> Result<ParsedFile, ParseError> {
    let language = normalize_language(path, language_hint)?;
    let tree_sitter_language = language_for(&language);
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_language)
        .map_err(|_| ParseError::LanguageLoadFailed(language.clone()))?;
    let tree = parser.parse(content, None).ok_or(ParseError::ParseFailed)?;
    let root = tree.root_node();
    let bytes = content.as_bytes();

    let mut parsed = ParsedFile {
        path: path.to_string(),
        language,
        symbols: Vec::new(),
        imports: Vec::new(),
        has_error: root.has_error(),
    };
    collect_node(root, bytes, &mut parsed);
    Ok(parsed)
}

fn normalize_language(path: &str, language_hint: Option<&str>) -> Result<String, ParseError> {
    let normalized_hint = language_hint.map(|language| language.to_ascii_lowercase());
    let language = match normalized_hint.as_deref() {
        Some("typescript") | Some("ts") => "typescript",
        Some("typescriptreact") | Some("tsx") => "tsx",
        Some("javascript") | Some("js") => "javascript",
        Some("javascriptreact") | Some("jsx") => "jsx",
        _ if path.ends_with(".tsx") => "tsx",
        _ if path.ends_with(".ts") => "typescript",
        _ if path.ends_with(".jsx") => "jsx",
        _ if path.ends_with(".js") => "javascript",
        Some(language) => return Err(ParseError::UnsupportedLanguage(language.to_string())),
        None => return Err(ParseError::UnsupportedLanguage(path.to_string())),
    };

    Ok(language.to_string())
}

fn language_for(language: &str) -> Language {
    match language {
        "typescript" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        "tsx" => tree_sitter_typescript::LANGUAGE_TSX.into(),
        "javascript" | "jsx" => tree_sitter_javascript::LANGUAGE.into(),
        _ => unreachable!("language is normalized before parser selection"),
    }
}

fn collect_node(node: Node<'_>, bytes: &[u8], parsed: &mut ParsedFile) {
    if let Some(symbol) = symbol_from_node(node, bytes) {
        parsed.symbols.push(symbol);
    }

    if node.kind() == "import_statement"
        || (node.kind() == "export_statement" && has_from_clause(node, bytes))
    {
        if let Some(import) = import_from_node(node, bytes, &parsed.path) {
            parsed.imports.push(import);
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_node(child, bytes, parsed);
    }
}

fn has_from_clause(node: Node<'_>, bytes: &[u8]) -> bool {
    node.utf8_text(bytes)
        .ok()
        .is_some_and(|text| text.contains(" from "))
}

fn symbol_from_node(node: Node<'_>, bytes: &[u8]) -> Option<ParsedSymbol> {
    let kind = match node.kind() {
        "function_declaration" => "function",
        "class_declaration" => "class",
        "interface_declaration" => "interface",
        "method_definition" => "method",
        "method_signature" => "method",
        "lexical_declaration" => return variable_function_symbol(node, bytes),
        _ => return None,
    };

    let name = node
        .child_by_field_name("name")
        .and_then(|name| node_text(name, bytes))?;
    Some(ParsedSymbol {
        name,
        kind: kind.to_string(),
        start_line: node.start_position().row as u32 + 1,
        end_line: node.end_position().row as u32 + 1,
    })
}

fn variable_function_symbol(node: Node<'_>, bytes: &[u8]) -> Option<ParsedSymbol> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() != "variable_declarator" {
            continue;
        }

        let value = child.child_by_field_name("value")?;
        if value.kind() != "arrow_function" && value.kind() != "function" {
            continue;
        }

        let name = child
            .child_by_field_name("name")
            .and_then(|name| node_text(name, bytes))?;
        return Some(ParsedSymbol {
            name,
            kind: "function".to_string(),
            start_line: child.start_position().row as u32 + 1,
            end_line: child.end_position().row as u32 + 1,
        });
    }

    None
}

fn import_from_node(node: Node<'_>, bytes: &[u8], source: &str) -> Option<ParsedImport> {
    let target = find_string_fragment(node, bytes)?;
    Some(ParsedImport {
        source: source.to_string(),
        is_external: !target.starts_with('.') && !target.starts_with('/'),
        target,
    })
}

fn find_string_fragment(node: Node<'_>, bytes: &[u8]) -> Option<String> {
    if node.kind() == "string_fragment" {
        return node_text(node, bytes);
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(fragment) = find_string_fragment(child, bytes) {
            return Some(fragment);
        }
    }

    None
}

fn node_text(node: Node<'_>, bytes: &[u8]) -> Option<String> {
    node.utf8_text(bytes).ok().map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_typescript_symbols_and_imports() {
        let source = r#"
import { createSession } from './session';
import React from 'react';
export { createAudit } from './audit';

export interface LoginRequest {
  email: string;
}

export class AuthService {
  login() {
    return createSession();
  }
}

export function validateLogin(request: LoginRequest) {
  return request.email.length > 0;
}

const normalizeLogin = (value: string) => value.trim();
"#;

        let parsed = parse_workspace_file("src/auth/login.ts", Some("typescript"), source)
            .expect("typescript should parse");

        assert_eq!(parsed.language, "typescript");
        assert!(!parsed.has_error);
        assert!(parsed.symbols.contains(&ParsedSymbol {
            name: "LoginRequest".to_string(),
            kind: "interface".to_string(),
            start_line: 6,
            end_line: 8,
        }));
        assert!(parsed
            .symbols
            .iter()
            .any(|symbol| symbol.name == "AuthService" && symbol.kind == "class"));
        assert!(parsed
            .symbols
            .iter()
            .any(|symbol| symbol.name == "login" && symbol.kind == "method"));
        assert!(parsed
            .symbols
            .iter()
            .any(|symbol| symbol.name == "validateLogin" && symbol.kind == "function"));
        assert!(parsed
            .symbols
            .iter()
            .any(|symbol| symbol.name == "normalizeLogin" && symbol.kind == "function"));
        assert_eq!(
            parsed.imports,
            vec![
                ParsedImport {
                    source: "src/auth/login.ts".to_string(),
                    target: "./session".to_string(),
                    is_external: false,
                },
                ParsedImport {
                    source: "src/auth/login.ts".to_string(),
                    target: "react".to_string(),
                    is_external: true,
                },
                ParsedImport {
                    source: "src/auth/login.ts".to_string(),
                    target: "./audit".to_string(),
                    is_external: false,
                },
            ]
        );
    }

    #[test]
    fn extracts_jsx_function_symbols() {
        let source = r#"
import { Button } from './Button';

export function App() {
  return <Button />;
}
"#;

        let parsed =
            parse_workspace_file("src/App.jsx", None, source).expect("jsx should parse from path");

        assert_eq!(parsed.language, "jsx");
        assert!(parsed
            .symbols
            .iter()
            .any(|symbol| symbol.name == "App" && symbol.kind == "function"));
        assert_eq!(parsed.imports[0].target, "./Button");
    }

    #[test]
    fn ignores_exported_string_literals_when_extracting_imports() {
        let source = r#"
export const route = "./session";
export { createAudit } from "./audit";
"#;

        let parsed = parse_workspace_file("src/auth/login.ts", Some("typescript"), source)
            .expect("typescript should parse");

        assert_eq!(
            parsed.imports,
            vec![ParsedImport {
                source: "src/auth/login.ts".to_string(),
                target: "./audit".to_string(),
                is_external: false,
            }]
        );
    }

    #[test]
    fn rejects_unsupported_languages() {
        let result = parse_workspace_file("src/main.rs", None, "fn main() {}");

        assert!(matches!(result, Err(ParseError::UnsupportedLanguage(_))));
    }
}
