use anchor_lang::prelude::*;

#[error]
pub enum BiddingError {
    #[msg("Asset not non-fungible token")]
    AssetInvalidError,
    #[msg("Invalid account")]
    InvalidAccountError,
    #[msg("Invalid last bid account")]
    InvalidLastBidAccount,
    #[msg("Insufficient bidding account")]
    InsufficientAccountError
}
