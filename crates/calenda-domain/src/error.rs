use thiserror::Error;

/// Errors a provider or use case can surface to the caller.
///
/// The variants are deliberately coarse: the UI needs to distinguish "you have
/// not granted access" from "that thing no longer exists" from "something broke",
/// and not much more.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("access to {entity} has not been granted")]
    AccessDenied { entity: &'static str },

    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },

    #[error("{entity} is read-only")]
    ReadOnly { entity: &'static str },

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("provider failure: {0}")]
    Provider(String),
}

pub type DomainResult<T> = Result<T, DomainError>;

impl DomainError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid(message.into())
    }

    pub fn provider(message: impl Into<String>) -> Self {
        Self::Provider(message.into())
    }
}
