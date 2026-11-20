/// Mescla atualizações em uma configuração JSON que precisa ser um objeto.
pub fn merge_setup_config(
    existing: serde_json::Value,
    updates: &[(&str, serde_json::Value)],
) -> Result<serde_json::Value, String> {
    let mut config = existing
        .as_object()
        .cloned()
        .map(serde_json::Value::Object)
        .ok_or_else(|| "configuração local inválida".to_string())?;
    for (key, value) in updates {
        config[key] = value.clone();
    }
    Ok(config)
}

/// Valida os campos de inicialização e preserva o restante da configuração local.
pub fn repair_setup_config(
    existing: serde_json::Value,
    environment_database_url: Option<&str>,
    generated_token: &str,
) -> Result<serde_json::Value, String> {
    if generated_token.len() != 64 || !generated_token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("token local inválido".to_string());
    }
    let mut config = match existing {
        serde_json::Value::Object(object) => serde_json::Value::Object(object),
        _ => serde_json::json!({}),
    };
    let record = config.as_object_mut().ok_or_else(|| "configuração local inválida".to_string())?;
    let saved_database_url = record.get("databaseUrl").and_then(serde_json::Value::as_str).map(str::trim);
    let database_url = saved_database_url.filter(|value| valid_postgres_url(value))
        .or_else(|| environment_database_url.map(str::trim).filter(|value| valid_postgres_url(value)));
    let token_is_valid = record.get("apiToken").and_then(serde_json::Value::as_str).is_some_and(valid_api_token);
    if let Some(database_url) = database_url {
        record.insert("databaseUrl".to_string(), serde_json::Value::String(database_url.to_string()));
    } else {
        record.remove("databaseUrl");
    }
    if !token_is_valid {
        record.insert("apiToken".to_string(), serde_json::Value::String(generated_token.to_string()));
    }
    Ok(config)
}

pub fn setup_needs_database_url(config: &serde_json::Value) -> bool {
    config.get("databaseUrl").and_then(serde_json::Value::as_str)
        .is_none_or(|value| !valid_postgres_url(value.trim()))
}

pub fn valid_api_token(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn valid_postgres_url(value: &str) -> bool {
    let rest = value.strip_prefix("postgres://").or_else(|| value.strip_prefix("postgresql://"));
    rest.is_some_and(|authority_and_path| {
        authority_and_path.split_once('/').is_some_and(|(authority, database)| {
            !authority.rsplit('@').next().unwrap_or("").is_empty()
                && !database.is_empty()
                && !value.chars().any(char::is_control)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::{merge_setup_config, repair_setup_config, setup_needs_database_url};
    use serde_json::{json, Value};

    #[test]
    fn consent_merge_preserves_database_url_and_api_token() {
        let merged = merge_setup_config(
            json!({"databaseUrl":"postgres://x/db","apiToken":"abc"}),
            &[("servicesConsent", Value::Bool(true))],
        )
        .unwrap();
        assert_eq!(merged, json!({"databaseUrl":"postgres://x/db","apiToken":"abc","servicesConsent":true}));
    }

    #[test]
    fn consent_merge_creates_missing_config() {
        assert_eq!(
            merge_setup_config(json!({}), &[("servicesConsent", Value::Bool(true))]).unwrap(),
            json!({"servicesConsent":true})
        );
    }

    #[test]
    fn saving_database_url_and_token_preserves_consent() {
        let merged = merge_setup_config(
            json!({"servicesConsent":true,"other":"kept"}),
            &[("databaseUrl", json!("postgres://x/db")), ("apiToken", json!("abc"))],
        )
        .unwrap();
        assert_eq!(merged, json!({"servicesConsent":true,"other":"kept","databaseUrl":"postgres://x/db","apiToken":"abc"}));
    }

    #[test]
    fn consent_merge_rejects_non_object_config_like_existing_behavior() {
        assert!(merge_setup_config(json!(null), &[("servicesConsent", Value::Bool(true))]).is_err());
    }

    #[test]
    fn setup_repair_creates_missing_config_and_preserves_other_values() {
        let repaired = repair_setup_config(json!({"servicesConsent":true}), Some("postgres://localhost/app"), &"a".repeat(64)).unwrap();
        assert_eq!(repaired["servicesConsent"], true);
        assert_eq!(repaired["databaseUrl"], "postgres://localhost/app");
        assert_eq!(repaired["apiToken"], "a".repeat(64));
    }

    #[test]
    fn setup_repair_replaces_short_token_and_keeps_valid_database_url() {
        let repaired = repair_setup_config(json!({"databaseUrl":"postgresql://localhost/saved","apiToken":"b".repeat(63),"servicesConsent":true}), None, &"c".repeat(64)).unwrap();
        assert_eq!(repaired["databaseUrl"], "postgresql://localhost/saved");
        assert_eq!(repaired["apiToken"], "c".repeat(64));
        assert_eq!(repaired["servicesConsent"], true);
    }

    #[test]
    fn setup_repair_replaces_invalid_database_url_from_environment() {
        let repaired = repair_setup_config(json!({"databaseUrl":"https://invalid","apiToken":"d".repeat(64)}), Some("postgres://localhost/app"), &"e".repeat(64)).unwrap();
        assert_eq!(repaired["databaseUrl"], "postgres://localhost/app");
        assert_eq!(repaired["apiToken"], "d".repeat(64));
    }

    #[test]
    fn setup_repair_creates_token_without_database_url() {
        let repaired = repair_setup_config(json!({}), None, &"f".repeat(64)).unwrap();
        assert_eq!(repaired["apiToken"], "f".repeat(64));
        assert!(repaired.get("databaseUrl").is_none());
        assert!(setup_needs_database_url(&repaired));
    }

    #[test]
    fn setup_repair_uses_environment_database_url_when_saved_url_is_missing() {
        let repaired = repair_setup_config(json!({"apiToken":"a".repeat(64)}), Some("postgresql://localhost/app"), &"b".repeat(64)).unwrap();
        assert_eq!(repaired["databaseUrl"], "postgresql://localhost/app");
        assert!(!setup_needs_database_url(&repaired));
    }

    #[test]
    fn setup_repair_preserves_valid_setup_without_changes() {
        let setup = json!({"databaseUrl":"postgres://localhost/app","apiToken":"a".repeat(64),"other":true});
        assert_eq!(repair_setup_config(setup.clone(), None, &"b".repeat(64)).unwrap(), setup);
        assert!(!setup_needs_database_url(&setup));
    }

    #[test]
    fn setup_repair_replaces_invalid_token_and_preserves_other_fields_without_url() {
        let repaired = repair_setup_config(json!({"apiToken":"bad","other":true}), None, &"c".repeat(64)).unwrap();
        assert_eq!(repaired["apiToken"], "c".repeat(64));
        assert_eq!(repaired["other"], true);
        assert!(repaired.get("databaseUrl").is_none());
    }
}
