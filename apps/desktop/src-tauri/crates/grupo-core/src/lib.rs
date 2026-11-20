pub mod setup_config;

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
    use super::{parse_callback, parse_reg_build};

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
}
