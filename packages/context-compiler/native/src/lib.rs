#![allow(non_snake_case)]

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use napi_derive::napi;

mod parser;

const PARSER_VERSION: &str = "tree-sitter-ts-js-v1";
const STRATEGY_VERSION: &str = "native-score-v1";

#[napi(object)]
#[derive(Clone, Debug)]
pub struct SourceRange {
    pub startLine: u32,
    pub startColumn: Option<u32>,
    pub endLine: u32,
    pub endColumn: Option<u32>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextReason {
    pub code: String,
    pub detail: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextScoreFactor {
    pub name: String,
    pub value: f64,
    pub weight: f64,
    pub contribution: f64,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextDiagnostic {
    pub path: String,
    pub message: String,
    pub severity: Option<String>,
    pub range: Option<SourceRange>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextTask {
    pub userPrompt: String,
    pub activeFile: Option<String>,
    pub activeSelection: Option<SourceRange>,
    pub mentionedSymbols: Vec<String>,
    pub constraints: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextWorkspace {
    pub root: String,
    pub languageHints: Vec<String>,
    pub openFiles: Vec<String>,
    pub changedFiles: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextBudget {
    pub maxTokens: u32,
    pub estimatedTokens: u32,
    pub tokensBeforeOptimization: u32,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextSymbol {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub file: String,
    pub range: SourceRange,
    pub score: f64,
    pub scoreFactors: Vec<ContextScoreFactor>,
    pub reasons: Vec<ContextReason>,
    pub contentMode: String,
    pub content: String,
    pub dependencies: Vec<String>,
    pub estimatedTokens: u32,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextFile {
    pub path: String,
    pub score: f64,
    pub scoreFactors: Vec<ContextScoreFactor>,
    pub includedMode: String,
    pub reasons: Vec<ContextReason>,
    pub estimatedTokens: u32,
    pub content: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct CompiledContext {
    pub symbols: Vec<ContextSymbol>,
    pub files: Vec<ContextFile>,
    pub summaries: Vec<ContextSummary>,
    pub diagnostics: Vec<ContextDiagnostic>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextSummary {
    pub id: String,
    pub kind: String,
    pub path: String,
    pub sourceHash: String,
    pub summary: String,
    pub estimatedTokens: u32,
    pub reasons: Vec<ContextReason>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct OmittedContextItem {
    pub id: String,
    pub kind: String,
    pub path: Option<String>,
    pub score: f64,
    pub reason: String,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextCompilerMetrics {
    pub contextBuildLatencyMs: u32,
    pub selectedFilesCount: u32,
    pub selectedSymbolsCount: u32,
    pub selectedDiagnosticsCount: u32,
    pub selectedRelevantSymbolsCount: u32,
    pub legacyBaselineTokens: u32,
    pub tokenSavingsPercent: f64,
    pub contextValuePerToken: f64,
    pub cacheHitRatio: f64,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ContextIr {
    pub version: String,
    pub task: ContextTask,
    pub workspace: ContextWorkspace,
    pub budget: ContextBudget,
    pub context: CompiledContext,
    pub omitted: Vec<OmittedContextItem>,
    pub metrics: ContextCompilerMetrics,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct WorkspaceFileInput {
    pub path: String,
    pub content: String,
    pub language: Option<String>,
    pub lastModified: Option<f64>,
    pub selectionPriority: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct BuildContextIrRequest {
    pub userPrompt: String,
    pub workspaceRoot: String,
    pub activeFile: Option<String>,
    pub activeSelection: Option<SourceRange>,
    pub openFiles: Vec<String>,
    pub changedFiles: Vec<String>,
    pub mentionedSymbols: Vec<String>,
    pub diagnostics: Vec<ContextDiagnostic>,
    pub maxTokens: u32,
    pub files: Vec<WorkspaceFileInput>,
}

#[napi(object)]
pub struct ContextSelectionExplanation {
    pub selectedFiles: Vec<ContextFile>,
    pub selectedSymbols: Vec<ContextSymbol>,
    pub omitted: Vec<OmittedContextItem>,
    pub metrics: ContextCompilerMetrics,
}

#[napi(object)]
pub struct ContextCompilerOptions {
    pub maxTokens: Option<u32>,
}

#[napi(object)]
pub struct IndexSummary {
    pub indexedFiles: u32,
    pub indexedSymbols: u32,
}

#[derive(Clone)]
struct IndexedFile {
    input: WorkspaceFileInput,
    parsed: Option<parser::ParsedFile>,
    content_hash: String,
    parser_version: String,
    strategy_version: String,
}

#[derive(Default)]
struct CompilerState {
    root: String,
    files: HashMap<String, IndexedFile>,
}

struct ScoredFile {
    file: ContextFile,
    indexed: IndexedFile,
}

struct PackedContext {
    files: Vec<ContextFile>,
    summaries: Vec<ContextSummary>,
    symbols: Vec<ContextSymbol>,
    estimated_tokens: u32,
}

#[derive(Default)]
struct TsConfigResolution {
    config_directory: String,
    base_url: Option<String>,
    paths: Vec<TsConfigPathMapping>,
}

struct TsConfigPathMapping {
    pattern: String,
    targets: Vec<String>,
}

static STATE: OnceLock<Mutex<CompilerState>> = OnceLock::new();

#[napi]
pub fn compiler_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[napi]
pub fn parse_workspace_file(
    path: String,
    language: Option<String>,
    content: String,
) -> napi::Result<String> {
    let parsed = parser::parse_workspace_file(&path, language.as_deref(), &content)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;

    serde_json::to_string(&parsed).map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn initialize(root: String, _options: Option<ContextCompilerOptions>) -> napi::Result<()> {
    let mut state = state().lock().map_err(lock_error)?;
    state.root = root;
    Ok(())
}

#[napi]
pub fn index_workspace(files: Vec<WorkspaceFileInput>) -> napi::Result<IndexSummary> {
    let indexed_files = files.into_iter().map(index_file).collect::<Vec<_>>();
    let indexed_symbols = count_symbols(&indexed_files);
    let mut state = state().lock().map_err(lock_error)?;
    state.files = indexed_files
        .into_iter()
        .map(|file| (file.input.path.clone(), file))
        .collect();

    Ok(IndexSummary {
        indexedFiles: state.files.len() as u32,
        indexedSymbols: indexed_symbols,
    })
}

#[napi]
pub fn update_file(file: WorkspaceFileInput) -> napi::Result<IndexSummary> {
    let indexed_file = index_file(file);
    let mut state = state().lock().map_err(lock_error)?;
    state
        .files
        .insert(indexed_file.input.path.clone(), indexed_file);

    Ok(IndexSummary {
        indexedFiles: state.files.len() as u32,
        indexedSymbols: state
            .files
            .values()
            .filter_map(|file| file.parsed.as_ref())
            .map(|parsed| parsed.symbols.len() as u32)
            .sum(),
    })
}

#[napi]
pub fn remove_file(path: String) -> napi::Result<()> {
    let mut state = state().lock().map_err(lock_error)?;
    state.files.remove(&path);
    Ok(())
}

#[napi]
pub fn build_context_ir(request: BuildContextIrRequest) -> napi::Result<ContextIr> {
    let state = state().lock().map_err(lock_error)?;
    Ok(build_context_ir_from_state(&state, &request))
}

#[napi]
pub fn explain_selection(
    request: BuildContextIrRequest,
) -> napi::Result<ContextSelectionExplanation> {
    let context_ir = build_context_ir(request)?;
    Ok(ContextSelectionExplanation {
        selectedFiles: context_ir.context.files,
        selectedSymbols: context_ir.context.symbols,
        omitted: context_ir.omitted,
        metrics: context_ir.metrics,
    })
}

fn state() -> &'static Mutex<CompilerState> {
    STATE.get_or_init(|| Mutex::new(CompilerState::default()))
}

fn lock_error<T>(_error: T) -> napi::Error {
    napi::Error::from_reason("context compiler state lock poisoned")
}

fn index_file(input: WorkspaceFileInput) -> IndexedFile {
    let parsed =
        parser::parse_workspace_file(&input.path, input.language.as_deref(), &input.content).ok();
    let content_hash = content_hash(&input.content);

    IndexedFile {
        input,
        parsed,
        content_hash,
        parser_version: PARSER_VERSION.to_string(),
        strategy_version: STRATEGY_VERSION.to_string(),
    }
}

fn content_hash(content: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in content.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

fn summarize_file(indexed: &IndexedFile) -> ContextSummary {
    let summary = indexed
        .input
        .content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(5)
        .collect::<Vec<_>>()
        .join("\n");
    let summary = if summary.is_empty() {
        format!("Empty or whitespace-only file: {}", indexed.input.path)
    } else {
        summary
    };
    let estimated_tokens = estimate_tokens(&summary);

    ContextSummary {
        id: format!("summary:{}", indexed.input.path),
        kind: "file".to_string(),
        path: indexed.input.path.clone(),
        sourceHash: indexed.content_hash.clone(),
        summary,
        estimatedTokens: estimated_tokens,
        reasons: vec![reason("budget_summary")],
    }
}

fn count_symbols(files: &[IndexedFile]) -> u32 {
    files
        .iter()
        .filter_map(|file| file.parsed.as_ref())
        .map(|parsed| parsed.symbols.len() as u32)
        .sum()
}

fn build_context_ir_from_state(
    state: &CompilerState,
    request: &BuildContextIrRequest,
) -> ContextIr {
    let start = std::time::Instant::now();
    let candidate_files = candidate_files(state, request);
    let cache_hits = cache_hits(state, &candidate_files);
    let tokens_before_optimization = candidate_files
        .iter()
        .map(|file| estimate_tokens(&file.input.content))
        .sum::<u32>();
    let dependency_targets =
        direct_dependency_targets(request.activeFile.as_deref(), &candidate_files);
    let mut scored_files = candidate_files
        .into_iter()
        .map(|file| score_file(file, request, &dependency_targets))
        .filter(|file| file.file.score > 0.0)
        .collect::<Vec<_>>();

    scored_files.sort_by(|left, right| {
        right
            .file
            .score
            .partial_cmp(&left.file.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut selected_files = Vec::new();
    let mut summaries = Vec::new();
    let mut omitted = Vec::new();
    let mut estimated_tokens = 0;

    for scored in scored_files {
        if estimated_tokens + scored.file.estimatedTokens > request.maxTokens {
            let summary = summarize_file(&scored.indexed);
            if estimated_tokens + summary.estimatedTokens <= request.maxTokens {
                estimated_tokens += summary.estimatedTokens;
                summaries.push(summary);
            }

            omitted.push(OmittedContextItem {
                id: scored.file.path.clone(),
                kind: "file".to_string(),
                path: Some(scored.file.path.clone()),
                score: scored.file.score,
                reason: "budget_exceeded".to_string(),
            });
            continue;
        }

        estimated_tokens += scored.file.estimatedTokens;
        selected_files.push(scored);
    }

    let symbols = selected_symbols(request, &selected_files);
    let language_hints = language_hints(request, &selected_files);
    let packed_context =
        pack_context_within_budget(selected_files, summaries, symbols, request.maxTokens);
    estimated_tokens = packed_context.estimated_tokens;
    let selected_files_count = packed_context.files.len() as u32;
    let selected_symbols_count = packed_context.symbols.len() as u32;
    let context_value_per_token = if estimated_tokens > 0 {
        (packed_context.files.len() + packed_context.symbols.len()) as f64 / estimated_tokens as f64
    } else {
        0.0
    };
    let token_savings_percent =
        calculate_token_savings(tokens_before_optimization, estimated_tokens);

    ContextIr {
        version: "0.1".to_string(),
        task: ContextTask {
            userPrompt: request.userPrompt.clone(),
            activeFile: request.activeFile.clone(),
            activeSelection: request.activeSelection.clone(),
            mentionedSymbols: request.mentionedSymbols.clone(),
            constraints: Vec::new(),
        },
        workspace: ContextWorkspace {
            root: if request.workspaceRoot.is_empty() {
                state.root.clone()
            } else {
                request.workspaceRoot.clone()
            },
            languageHints: language_hints,
            openFiles: request.openFiles.clone(),
            changedFiles: request.changedFiles.clone(),
        },
        budget: ContextBudget {
            maxTokens: request.maxTokens,
            estimatedTokens: estimated_tokens,
            tokensBeforeOptimization: tokens_before_optimization,
        },
        context: CompiledContext {
            symbols: packed_context.symbols,
            files: packed_context.files,
            summaries: packed_context.summaries,
            diagnostics: request.diagnostics.clone(),
        },
        omitted,
        metrics: ContextCompilerMetrics {
            contextBuildLatencyMs: start.elapsed().as_millis() as u32,
            selectedFilesCount: selected_files_count,
            selectedSymbolsCount: selected_symbols_count,
            selectedDiagnosticsCount: request.diagnostics.len() as u32,
            selectedRelevantSymbolsCount: selected_symbols_count,
            legacyBaselineTokens: tokens_before_optimization,
            tokenSavingsPercent: token_savings_percent,
            contextValuePerToken: context_value_per_token,
            cacheHitRatio: if cache_hits.1 > 0 {
                cache_hits.0 as f64 / cache_hits.1 as f64
            } else {
                0.0
            },
        },
    }
}

fn pack_context_within_budget(
    selected_files: Vec<ScoredFile>,
    summaries: Vec<ContextSummary>,
    selected_symbols: Vec<ContextSymbol>,
    max_tokens: u32,
) -> PackedContext {
    let mut symbols = selected_symbols;
    let mut files = compact_files_with_symbol_chunks(&selected_files, &symbols);
    let mut estimated_tokens = context_token_total(&files, &summaries, &symbols);

    while estimated_tokens > max_tokens && !symbols.is_empty() {
        symbols.pop();
        files = compact_files_with_symbol_chunks(&selected_files, &symbols);
        estimated_tokens = context_token_total(&files, &summaries, &symbols);
    }

    PackedContext {
        files,
        summaries,
        symbols,
        estimated_tokens,
    }
}

fn compact_files_with_symbol_chunks(
    files: &[ScoredFile],
    symbols: &[ContextSymbol],
) -> Vec<ContextFile> {
    let files_with_symbols = symbols
        .iter()
        .map(|symbol| symbol.file.as_str())
        .collect::<HashSet<_>>();

    files
        .iter()
        .map(|selected| {
            if files_with_symbols.contains(selected.file.path.as_str()) {
                metadata_file(&selected.file)
            } else {
                selected.file.clone()
            }
        })
        .collect()
}

fn metadata_file(file: &ContextFile) -> ContextFile {
    ContextFile {
        includedMode: "metadata".to_string(),
        estimatedTokens: 0,
        content: None,
        ..file.clone()
    }
}

fn context_token_total(
    files: &[ContextFile],
    summaries: &[ContextSummary],
    symbols: &[ContextSymbol],
) -> u32 {
    files.iter().map(|file| file.estimatedTokens).sum::<u32>()
        + summaries
            .iter()
            .map(|summary| summary.estimatedTokens)
            .sum::<u32>()
        + symbols
            .iter()
            .map(|symbol| symbol.estimatedTokens)
            .sum::<u32>()
}

fn candidate_files(state: &CompilerState, request: &BuildContextIrRequest) -> Vec<IndexedFile> {
    if !request.files.is_empty() {
        return request
            .files
            .iter()
            .map(|file| {
                let hash = content_hash(&file.content);
                state
                    .files
                    .get(&file.path)
                    .filter(|indexed| {
                        indexed.content_hash == hash
                            && indexed.parser_version == PARSER_VERSION
                            && indexed.strategy_version == STRATEGY_VERSION
                    })
                    .cloned()
                    .unwrap_or_else(|| index_file(file.clone()))
            })
            .collect::<Vec<_>>();
    }

    state
        .files
        .values()
        .map(|file| {
            if file.parser_version == PARSER_VERSION && file.strategy_version == STRATEGY_VERSION {
                file.clone()
            } else {
                index_file(file.input.clone())
            }
        })
        .collect()
}

fn cache_hits(state: &CompilerState, files: &[IndexedFile]) -> (usize, usize) {
    let hits = files
        .iter()
        .filter(|file| {
            state.files.get(&file.input.path).is_some_and(|indexed| {
                indexed.content_hash == file.content_hash
                    && indexed.parser_version == file.parser_version
                    && indexed.strategy_version == file.strategy_version
                    && indexed.parser_version == PARSER_VERSION
                    && indexed.strategy_version == STRATEGY_VERSION
            })
        })
        .count();

    (hits, files.len())
}

fn normalize_path(value: &str) -> String {
    value.replace('\\', "/")
}

fn dirname(path: &str) -> String {
    let normalized = normalize_path(path);
    normalized
        .rsplit_once('/')
        .map(|(directory, _file)| directory.to_string())
        .unwrap_or_default()
}

fn join_path(base: &str, target: &str) -> String {
    let mut parts = Vec::new();
    let combined = if target.starts_with('/') {
        target.to_string()
    } else if base.is_empty() {
        target.to_string()
    } else {
        format!("{base}/{target}")
    };

    let normalized = normalize_path(&combined);
    for part in normalized.split('/') {
        match part {
            "" if parts.is_empty() && combined.starts_with('/') => parts.push(String::new()),
            "" | "." => {}
            ".." => {
                if parts.len() > 1 {
                    parts.pop();
                }
            }
            value => parts.push(value.to_string()),
        }
    }

    if parts.first().is_some_and(|part| part.is_empty()) {
        format!("/{}", parts[1..].join("/"))
    } else {
        parts.join("/")
    }
}

fn candidate_paths(base_path: &str) -> Vec<String> {
    [
        base_path.to_string(),
        format!("{base_path}.ts"),
        format!("{base_path}.tsx"),
        format!("{base_path}.js"),
        format!("{base_path}.jsx"),
        format!("{base_path}/index.ts"),
        format!("{base_path}/index.tsx"),
        format!("{base_path}/index.js"),
        format!("{base_path}/index.jsx"),
    ]
    .into_iter()
    .map(|path| normalize_path(&path))
    .collect()
}

fn match_existing_file(
    base_path: &str,
    files_by_path: &HashMap<String, IndexedFile>,
) -> Option<String> {
    candidate_paths(base_path)
        .into_iter()
        .find_map(|candidate| {
            files_by_path
                .get(&candidate)
                .map(|file| file.input.path.clone())
        })
}

fn parse_tsconfig(file: &IndexedFile) -> Option<TsConfigResolution> {
    let parsed = serde_json::from_str::<serde_json::Value>(&file.input.content).ok()?;
    let compiler_options = parsed.get("compilerOptions")?.as_object()?;
    let base_url = compiler_options
        .get("baseUrl")
        .and_then(|value| value.as_str())
        .map(ToString::to_string);
    let paths = compiler_options
        .get("paths")
        .and_then(|value| value.as_object())
        .map(|paths| {
            paths
                .iter()
                .filter_map(|(pattern, value)| {
                    let targets = value
                        .as_array()?
                        .iter()
                        .filter_map(|target| target.as_str().map(ToString::to_string))
                        .collect::<Vec<_>>();

                    if targets.is_empty() {
                        None
                    } else {
                        Some(TsConfigPathMapping {
                            pattern: pattern.to_string(),
                            targets,
                        })
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if base_url.is_none() && paths.is_empty() {
        return None;
    }

    Some(TsConfigResolution {
        config_directory: dirname(&file.input.path),
        base_url,
        paths,
    })
}

fn load_tsconfig(files: &[IndexedFile]) -> Option<TsConfigResolution> {
    files
        .iter()
        .find(|file| {
            let path = normalize_path(&file.input.path);
            path == "tsconfig.json" || path.ends_with("/tsconfig.json")
        })
        .and_then(parse_tsconfig)
}

fn resolve_path_alias(
    specifier: &str,
    files_by_path: &HashMap<String, IndexedFile>,
    tsconfig: Option<&TsConfigResolution>,
) -> Option<String> {
    let tsconfig = tsconfig?;
    let base_directory = join_path(
        &tsconfig.config_directory,
        tsconfig.base_url.as_deref().unwrap_or("."),
    );

    for mapping in &tsconfig.paths {
        let wildcard_index = mapping.pattern.find('*');
        if wildcard_index.is_none() && specifier != mapping.pattern {
            continue;
        }

        let prefix = wildcard_index
            .map(|index| &mapping.pattern[..index])
            .unwrap_or(mapping.pattern.as_str());
        let suffix = wildcard_index
            .map(|index| &mapping.pattern[index + 1..])
            .unwrap_or("");

        if !specifier.starts_with(prefix) || !specifier.ends_with(suffix) {
            continue;
        }

        let wildcard = wildcard_index
            .map(|_| &specifier[prefix.len()..specifier.len() - suffix.len()])
            .unwrap_or("");

        for target in &mapping.targets {
            let resolved_target = target.replace('*', wildcard);
            if let Some(resolved) =
                match_existing_file(&join_path(&base_directory, &resolved_target), files_by_path)
            {
                return Some(resolved);
            }
        }
    }

    if tsconfig.base_url.is_some() {
        return match_existing_file(&join_path(&base_directory, specifier), files_by_path);
    }

    None
}

fn resolve_import_specifier(
    source_path: &str,
    specifier: &str,
    files_by_path: &HashMap<String, IndexedFile>,
    tsconfig: Option<&TsConfigResolution>,
) -> Option<String> {
    if specifier.starts_with('.') {
        return match_existing_file(&join_path(&dirname(source_path), specifier), files_by_path);
    }

    if specifier.starts_with('/') {
        return match_existing_file(specifier, files_by_path);
    }

    resolve_path_alias(specifier, files_by_path, tsconfig)
}

fn direct_dependency_targets(source_path: Option<&str>, files: &[IndexedFile]) -> HashSet<String> {
    let Some(source_path) = source_path else {
        return HashSet::new();
    };
    let files_by_path = files
        .iter()
        .cloned()
        .map(|file| (normalize_path(&file.input.path), file))
        .collect::<HashMap<_, _>>();
    let Some(source) = files_by_path.get(&normalize_path(source_path)) else {
        return HashSet::new();
    };
    let Some(parsed) = source.parsed.as_ref() else {
        return HashSet::new();
    };
    let tsconfig = load_tsconfig(files);

    parsed
        .imports
        .iter()
        .filter_map(|import| {
            resolve_import_specifier(
                &source.input.path,
                &import.target,
                &files_by_path,
                tsconfig.as_ref(),
            )
        })
        .collect()
}

fn score_file(
    indexed: IndexedFile,
    request: &BuildContextIrRequest,
    dependency_targets: &HashSet<String>,
) -> ScoredFile {
    let input = &indexed.input;
    let is_active = request.activeFile.as_deref() == Some(input.path.as_str());
    let is_open = request.openFiles.iter().any(|file| file == &input.path);
    let is_changed = request.changedFiles.iter().any(|file| file == &input.path);
    let is_direct_dependency = dependency_targets.contains(&input.path);
    let legacy_priority = input.selectionPriority.unwrap_or(0.0);
    let normalized_legacy_priority = normalize_score(legacy_priority);
    let score = legacy_priority
        + if is_active { 1.0 } else { 0.0 }
        + if is_open { 0.5 } else { 0.0 }
        + if is_changed { 0.5 } else { 0.0 }
        + if is_direct_dependency { 0.4 } else { 0.0 };

    let mut reasons = Vec::new();
    if legacy_priority > 0.0 {
        reasons.push(reason("legacy_context_window"));
    }
    if is_active {
        reasons.push(reason("active_file"));
    }
    if is_open {
        reasons.push(reason("open_file"));
    }
    if is_changed {
        reasons.push(reason("changed_file"));
    }
    if is_direct_dependency {
        reasons.push(reason("direct_dependency"));
    }

    ScoredFile {
        file: ContextFile {
            path: input.path.clone(),
            score,
            scoreFactors: vec![
                ContextScoreFactor {
                    name: "active_editor_proximity".to_string(),
                    value: if is_active { 1.0 } else { 0.0 },
                    weight: 0.25,
                    contribution: if is_active { 0.25 } else { 0.0 },
                },
                ContextScoreFactor {
                    name: "open_tab_or_recency".to_string(),
                    value: if is_open || is_changed { 1.0 } else { 0.0 },
                    weight: 0.1,
                    contribution: if is_open || is_changed { 0.1 } else { 0.0 },
                },
                ContextScoreFactor {
                    name: "legacy_context_priority".to_string(),
                    value: normalized_legacy_priority,
                    weight: 1.0,
                    contribution: normalized_legacy_priority,
                },
                ContextScoreFactor {
                    name: "dependency_proximity".to_string(),
                    value: if is_direct_dependency { 1.0 } else { 0.0 },
                    weight: 0.4,
                    contribution: if is_direct_dependency { 0.4 } else { 0.0 },
                },
            ],
            includedMode: "full".to_string(),
            reasons,
            estimatedTokens: estimate_tokens(&input.content),
            content: Some(input.content.clone()),
        },
        indexed,
    }
}

fn selected_symbols(
    request: &BuildContextIrRequest,
    selected_files: &[ScoredFile],
) -> Vec<ContextSymbol> {
    let mut symbols = Vec::new();

    for selected in selected_files {
        let file = &selected.file;
        let indexed = &selected.indexed;
        let Some(parsed) = indexed.parsed.as_ref() else {
            continue;
        };

        for symbol in &parsed.symbols {
            let is_mentioned = request
                .mentionedSymbols
                .iter()
                .any(|mentioned| mentioned == &symbol.name);
            let is_active_file = request.activeFile.as_deref() == Some(file.path.as_str());
            if !is_mentioned && !is_active_file {
                continue;
            }

            let content = extract_lines(&indexed.input.content, symbol.start_line, symbol.end_line);
            let estimated_tokens = estimate_tokens(&content);
            let score = if is_mentioned { 1.0 } else { 0.5 };
            symbols.push(ContextSymbol {
                id: format!(
                    "{}:{}:{}:{}",
                    file.path, symbol.kind, symbol.name, symbol.start_line
                ),
                name: symbol.name.clone(),
                kind: symbol.kind.clone(),
                file: file.path.clone(),
                range: SourceRange {
                    startLine: symbol.start_line,
                    startColumn: None,
                    endLine: symbol.end_line,
                    endColumn: None,
                },
                score,
                scoreFactors: vec![ContextScoreFactor {
                    name: "symbol_match".to_string(),
                    value: if is_mentioned { 1.0 } else { 0.5 },
                    weight: 0.35,
                    contribution: if is_mentioned { 0.35 } else { 0.175 },
                }],
                reasons: if is_mentioned {
                    vec![ContextReason {
                        code: "mentioned_symbol".to_string(),
                        detail: Some(symbol.name.clone()),
                    }]
                } else {
                    vec![reason("active_file_symbol")]
                },
                contentMode: "source".to_string(),
                content,
                dependencies: parsed
                    .imports
                    .iter()
                    .filter(|import| !import.is_external)
                    .map(|import| import.target.clone())
                    .collect(),
                estimatedTokens: estimated_tokens,
            });
        }
    }

    symbols
}

fn language_hints(request: &BuildContextIrRequest, selected_files: &[ScoredFile]) -> Vec<String> {
    let mut hints = Vec::new();

    for selected in selected_files {
        let file = &selected.file;
        if let Some(language) = request
            .files
            .iter()
            .find(|input| input.path == file.path)
            .and_then(|input| input.language.clone())
        {
            push_unique(&mut hints, language);
            continue;
        }

        if let Some(language) = selected
            .indexed
            .parsed
            .as_ref()
            .map(|parsed| parsed.language.clone())
        {
            push_unique(&mut hints, language);
        }
    }

    hints
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn reason(code: &str) -> ContextReason {
    ContextReason {
        code: code.to_string(),
        detail: None,
    }
}

fn estimate_tokens(text: &str) -> u32 {
    ((text.len() as f64) / 4.0).ceil() as u32
}

fn calculate_token_savings(before: u32, after: u32) -> f64 {
    if before == 0 {
        return 0.0;
    }

    (before.saturating_sub(after) as f64 / before as f64 * 100.0).max(0.0)
}

fn normalize_score(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

fn extract_lines(content: &str, start_line: u32, end_line: u32) -> String {
    let start_index = start_line.saturating_sub(1) as usize;
    let count = end_line.saturating_sub(start_line).saturating_add(1) as usize;
    content
        .lines()
        .skip(start_index)
        .take(count)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, content: &str, selection_priority: Option<f64>) -> WorkspaceFileInput {
        WorkspaceFileInput {
            path: path.to_string(),
            content: content.to_string(),
            language: Some("typescript".to_string()),
            lastModified: None,
            selectionPriority: selection_priority,
        }
    }

    fn request(files: Vec<WorkspaceFileInput>) -> BuildContextIrRequest {
        BuildContextIrRequest {
            userPrompt: "fix login".to_string(),
            workspaceRoot: "/workspace".to_string(),
            activeFile: Some("/workspace/src/login.ts".to_string()),
            activeSelection: None,
            openFiles: vec!["/workspace/src/login.ts".to_string()],
            changedFiles: Vec::new(),
            mentionedSymbols: vec!["login".to_string()],
            diagnostics: Vec::new(),
            maxTokens: 100,
            files,
        }
    }

    #[test]
    fn builds_context_ir_from_request_files() {
        let request = request(vec![
            file(
                "/workspace/src/login.ts",
                "export function login() {\n  return true;\n}",
                Some(10.0),
            ),
            file(
                "/workspace/src/session.ts",
                "export function session() {\n  return true;\n}",
                None,
            ),
        ]);
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert_eq!(context_ir.version, "0.1");
        assert_eq!(context_ir.context.files.len(), 1);
        assert_eq!(context_ir.context.files[0].path, "/workspace/src/login.ts");
        assert_eq!(context_ir.context.files[0].score, 11.5);
        assert_eq!(context_ir.context.files[0].scoreFactors[2].value, 1.0);
        assert_eq!(context_ir.context.symbols.len(), 1);
        assert_eq!(context_ir.context.symbols[0].name, "login");
        assert_eq!(
            context_ir.context.symbols[0].id,
            "/workspace/src/login.ts:function:login:1"
        );
    }

    #[test]
    fn scores_active_open_and_changed_files_with_symbol_reasons() {
        let request = BuildContextIrRequest {
            mentionedSymbols: Vec::new(),
            changedFiles: vec!["/workspace/src/session.ts".to_string()],
            files: vec![
                file(
                    "/workspace/src/login.ts",
                    "export function login() {\n  return true;\n}",
                    None,
                ),
                file(
                    "/workspace/src/session.ts",
                    "export function session() {\n  return true;\n}",
                    None,
                ),
            ],
            ..request(Vec::new())
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert_eq!(context_ir.context.files.len(), 2);
        assert_eq!(context_ir.context.files[0].path, "/workspace/src/login.ts");
        assert_eq!(
            context_ir.context.files[0]
                .reasons
                .iter()
                .map(|reason| reason.code.as_str())
                .collect::<Vec<_>>(),
            vec!["active_file", "open_file"]
        );
        assert_eq!(
            context_ir.context.files[1]
                .reasons
                .iter()
                .map(|reason| reason.code.as_str())
                .collect::<Vec<_>>(),
            vec!["changed_file"]
        );
        assert_eq!(context_ir.context.symbols.len(), 1);
        assert_eq!(context_ir.context.symbols[0].name, "login");
        assert_eq!(
            context_ir.context.symbols[0].reasons[0].code,
            "active_file_symbol"
        );
    }

    #[test]
    fn selects_direct_dependencies_resolved_through_tsconfig_paths() {
        let request = BuildContextIrRequest {
            files: vec![
                file(
                    "/workspace/src/login.ts",
                    "import { session } from '@app/session';\nexport function login() { return session(); }",
                    None,
                ),
                file(
                    "/workspace/src/session.ts",
                    "export function session() {\n  return true;\n}",
                    None,
                ),
                WorkspaceFileInput {
                    path: "/workspace/tsconfig.json".to_string(),
                    content: r#"{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"]}}}"#
                        .to_string(),
                    language: Some("json".to_string()),
                    lastModified: None,
                    selectionPriority: None,
                },
            ],
            ..request(Vec::new())
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert_eq!(context_ir.context.files.len(), 2);
        assert_eq!(
            context_ir.context.files[1].path,
            "/workspace/src/session.ts"
        );
        assert_eq!(context_ir.context.files[1].score, 0.4);
        assert_eq!(
            context_ir.context.files[1]
                .reasons
                .iter()
                .map(|reason| reason.code.as_str())
                .collect::<Vec<_>>(),
            vec!["direct_dependency"]
        );
        assert_eq!(
            context_ir.context.files[1].scoreFactors[3].name,
            "dependency_proximity"
        );
        assert_eq!(context_ir.context.files[1].scoreFactors[3].value, 1.0);
    }

    #[test]
    fn resolves_tsconfig_paths_for_relative_workspace_files() {
        let request = BuildContextIrRequest {
            workspaceRoot: String::new(),
            activeFile: Some("src/login.ts".to_string()),
            openFiles: vec!["src/login.ts".to_string()],
            files: vec![
                file(
                    "src/login.ts",
                    "import { session } from '@app/session';\nexport function login() { return session(); }",
                    None,
                ),
                file(
                    "src/session.ts",
                    "export function session() {\n  return true;\n}",
                    None,
                ),
                WorkspaceFileInput {
                    path: "tsconfig.json".to_string(),
                    content: r#"{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"]}}}"#
                        .to_string(),
                    language: Some("json".to_string()),
                    lastModified: None,
                    selectionPriority: None,
                },
            ],
            ..request(Vec::new())
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert_eq!(context_ir.context.files.len(), 2);
        assert_eq!(context_ir.context.files[0].path, "src/login.ts");
        assert_eq!(context_ir.context.files[1].path, "src/session.ts");
    }

    #[test]
    fn does_not_prefix_match_exact_tsconfig_paths() {
        let request = BuildContextIrRequest {
            files: vec![
                file(
                    "/workspace/src/login.ts",
                    "import { session } from '@app/session/extra';\nexport function login() { return session(); }",
                    None,
                ),
                file(
                    "/workspace/src/session.ts",
                    "export function session() {\n  return true;\n}",
                    None,
                ),
                WorkspaceFileInput {
                    path: "/workspace/tsconfig.json".to_string(),
                    content: r#"{"compilerOptions":{"baseUrl":".","paths":{"@app/session":["src/session"]}}}"#
                        .to_string(),
                    language: Some("json".to_string()),
                    lastModified: None,
                    selectionPriority: None,
                },
            ],
            ..request(Vec::new())
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert_eq!(context_ir.context.files.len(), 1);
        assert_eq!(context_ir.context.files[0].path, "/workspace/src/login.ts");
    }

    #[test]
    fn reports_cache_hit_ratio_from_content_hashes() {
        let files = vec![
            file(
                "/workspace/src/login.ts",
                "export function login() {\n  return true;\n}",
                None,
            ),
            file(
                "/workspace/src/session.ts",
                "export function session() {\n  return true;\n}",
                None,
            ),
        ];
        let state = CompilerState {
            root: "/workspace".to_string(),
            files: files
                .iter()
                .cloned()
                .map(index_file)
                .map(|file| (file.input.path.clone(), file))
                .collect(),
        };

        let cached_context_ir = build_context_ir_from_state(&state, &request(files.clone()));
        let partially_changed_context_ir = build_context_ir_from_state(
            &state,
            &request(vec![
                file(
                    "/workspace/src/login.ts",
                    "export function login() {\n  return false;\n}",
                    None,
                ),
                file(
                    "/workspace/src/session.ts",
                    "export function session() {\n  return true;\n}",
                    None,
                ),
            ]),
        );

        assert_eq!(cached_context_ir.metrics.cacheHitRatio, 1.0);
        assert_eq!(partially_changed_context_ir.metrics.cacheHitRatio, 0.5);
    }

    #[test]
    fn invalidates_cache_when_parser_or_strategy_version_changes() {
        let login_file = file(
            "/workspace/src/login.ts",
            "export function login() {\n  return true;\n}",
            None,
        );
        let session_file = file(
            "/workspace/src/session.ts",
            "export function session() {\n  return true;\n}",
            None,
        );
        let mut stale_parser_file = index_file(login_file.clone());
        stale_parser_file.parser_version = "old-parser".to_string();
        let mut stale_strategy_file = index_file(session_file.clone());
        stale_strategy_file.strategy_version = "old-strategy".to_string();
        let state = CompilerState {
            root: "/workspace".to_string(),
            files: vec![stale_parser_file, stale_strategy_file]
                .into_iter()
                .map(|file| (file.input.path.clone(), file))
                .collect(),
        };

        let context_ir =
            build_context_ir_from_state(&state, &request(vec![login_file, session_file]));

        assert_eq!(context_ir.metrics.cacheHitRatio, 0.0);
    }

    #[test]
    fn reindexes_stale_versioned_entries_when_request_files_are_empty() {
        let login_file = file(
            "/workspace/src/login.ts",
            "export function login() {\n  return true;\n}",
            None,
        );
        let mut stale_indexed_file = index_file(login_file);
        stale_indexed_file.parser_version = "old-parser".to_string();
        stale_indexed_file.parsed = None;
        let state = CompilerState {
            root: "/workspace".to_string(),
            files: vec![stale_indexed_file]
                .into_iter()
                .map(|file| (file.input.path.clone(), file))
                .collect(),
        };

        let context_ir = build_context_ir_from_state(
            &state,
            &BuildContextIrRequest {
                files: Vec::new(),
                ..request(Vec::new())
            },
        );

        assert_eq!(context_ir.metrics.cacheHitRatio, 0.0);
        assert_eq!(context_ir.context.symbols.len(), 1);
        assert_eq!(context_ir.context.symbols[0].name, "login");
    }

    #[test]
    fn uses_changed_request_content_for_native_symbol_chunks() {
        let indexed_file = file(
            "/workspace/src/login.ts",
            "export function login() {\n  return true;\n}",
            None,
        );
        let state = CompilerState {
            root: "/workspace".to_string(),
            files: vec![index_file(indexed_file)]
                .into_iter()
                .map(|file| (file.input.path.clone(), file))
                .collect(),
        };

        let context_ir = build_context_ir_from_state(
            &state,
            &request(vec![file(
                "/workspace/src/login.ts",
                "export function login() {\n  return false;\n}",
                None,
            )]),
        );
        let symbol_content = &context_ir.context.symbols[0].content;

        assert!(symbol_content.contains("return false"));
        assert!(!symbol_content.contains("return true"));
        assert_eq!(context_ir.metrics.cacheHitRatio, 0.0);
    }

    #[test]
    fn packs_native_symbol_chunks_inside_the_token_budget() {
        let content = format!(
            "export function login() {{\n  const token = \"{}\";\n  return token;\n}}\nexport function logout() {{\n  return false;\n}}",
            "x".repeat(120)
        );
        let request = BuildContextIrRequest {
            maxTokens: estimate_tokens(&content),
            ..request(vec![file("/workspace/src/login.ts", &content, Some(10.0))])
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);
        let actual_tokens = context_ir
            .context
            .files
            .iter()
            .map(|file| file.estimatedTokens)
            .sum::<u32>()
            + context_ir
                .context
                .summaries
                .iter()
                .map(|summary| summary.estimatedTokens)
                .sum::<u32>()
            + context_ir
                .context
                .symbols
                .iter()
                .map(|symbol| symbol.estimatedTokens)
                .sum::<u32>();

        assert_eq!(context_ir.budget.estimatedTokens, actual_tokens);
        assert!(context_ir.budget.estimatedTokens <= context_ir.budget.maxTokens);
        assert_eq!(context_ir.context.files[0].includedMode, "metadata");
        assert_eq!(context_ir.context.files[0].estimatedTokens, 0);
        assert!(context_ir.context.files[0].content.is_none());
        assert!(!context_ir.context.symbols.is_empty());
    }

    #[test]
    fn omits_over_budget_files() {
        let request = BuildContextIrRequest {
            maxTokens: 1,
            ..request(vec![file(
                "/workspace/src/login.ts",
                "export function login() { return true; }",
                Some(10.0),
            )])
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert!(context_ir.context.files.is_empty());
        assert_eq!(context_ir.omitted[0].reason, "budget_exceeded");
    }

    #[test]
    fn adds_source_hashed_summaries_for_over_budget_files() {
        let summary_lines = [
            "export function login() {",
            "return true;",
            "}",
            "export const status = true;",
            "export const scope = 'auth';",
        ];
        let large_content = format!(
            "{}\nconst filler = \"{}\";",
            summary_lines.join("\n"),
            "x".repeat(400)
        );
        let request = BuildContextIrRequest {
            maxTokens: 30,
            ..request(vec![file("/workspace/src/login.ts", &large_content, None)])
        };
        let state = CompilerState::default();

        let context_ir = build_context_ir_from_state(&state, &request);

        assert!(context_ir.context.files.is_empty());
        assert_eq!(context_ir.omitted[0].reason, "budget_exceeded");
        assert_eq!(context_ir.context.summaries.len(), 1);
        assert_eq!(
            context_ir.context.summaries[0].id,
            "summary:/workspace/src/login.ts"
        );
        assert_eq!(
            context_ir.context.summaries[0].sourceHash,
            content_hash(&large_content)
        );
        assert_eq!(
            context_ir.context.summaries[0].summary,
            summary_lines.join("\n")
        );
        assert_eq!(
            context_ir.context.summaries[0].reasons[0].code,
            "budget_summary"
        );
    }
}
