pub mod setup_config;

/// Valida o formato do SHA-256 informado para o instalador portátil.
pub fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Aceita somente arquivos ZIP descendentes do diretório de downloads do projeto.
pub fn valid_postgres_archive_path(path: &std::path::Path, downloads: &std::path::Path) -> bool {
    path.extension().and_then(std::ffi::OsStr::to_str).is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
        && path.starts_with(downloads)
        && path != downloads
}

/// Interpreta o valor `CurrentBuild` emitido por `reg query`.
pub fn parse_reg_build(output: &str) -> Option<u32> {
    output.lines().find_map(|line| {
        let mut columns = line.split_whitespace();
        if columns.next()? != "CurrentBuild" {
            return None;
        }
        columns.nth(1)?.parse::<u32>().ok()
    })
}

/// Lê o caminho da requisição (`/cb?session=...`) e devolve a sessão ou o erro informado.
pub fn parse_callback(target: &str) -> Option<Result<String, String>> {
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != "/cb" {
        return None;
    }
    let mut session = None;
    let mut error = None;
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            match key {
                "session" if !value.is_empty() => session = Some(value.to_string()),
                "error" => error = Some(value.to_string()),
                _ => {}
            }
        }
    }
    Some(match session {
        Some(value) => Ok(value),
        None => Err(error.unwrap_or_else(|| "falhou".to_string())),
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_callback, parse_reg_build, valid_postgres_archive_path, valid_sha256};

    #[test]
    fn parses_reg_query_build() {
        assert!(matches!(
            parse_reg_build("\nHKEY_LOCAL_MACHINE\\...\n    CurrentBuild    REG_SZ    26200\n"),
            Some(26200)
        ));
    }

    #[test]
    fn rejects_missing_or_invalid_reg_query_build() {
        assert!(
            parse_reg_build("").is_none()
                && parse_reg_build("CurrentBuild REG_SZ abc").is_none()
        );
    }

    #[test]
    fn parses_callback_session() {
        assert_eq!(parse_callback("/cb?session=abc"), Some(Ok("abc".to_string())));
    }

    #[test]
    fn callback_error_defaults_to_failure_message() {
        assert_eq!(parse_callback("/cb?error=denied"), Some(Err("denied".to_string())));
        assert_eq!(parse_callback("/cb"), Some(Err("falhou".to_string())));
    }

    #[test]
    fn callback_rejects_other_paths() {
        assert_eq!(parse_callback("/other?session=abc"), None);
    }

    #[test]
    fn validates_postgres_archive_hash_and_location() {
        assert!(valid_sha256(&"aB".repeat(32)));
        assert!(!valid_sha256(&"a".repeat(63)));
        assert!(!valid_sha256(&format!("{}z", "a".repeat(63))));
        let downloads = std::path::Path::new("T:/project/.cache/downloads");
        assert!(valid_postgres_archive_path(&downloads.join("postgres.zip"), downloads));
        assert!(!valid_postgres_archive_path(&std::path::PathBuf::from("T:/other/postgres.zip"), downloads));
        assert!(!valid_postgres_archive_path(&downloads.join("postgres.tar"), downloads));
    }
}
