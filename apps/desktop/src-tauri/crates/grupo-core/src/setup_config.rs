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

#[cfg(test)]
mod tests {
    use super::merge_setup_config;
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
}
