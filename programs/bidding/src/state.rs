use anchor_lang::prelude::*;

#[account]
pub struct Auction {
    pub min_price: u64,
    pub highest_bid: u64,
    pub bidder_acc: Option<Pubkey>,
    pub payment_mint: Pubkey,
    pub asset_acc: Pubkey,
    pub deposit_acc: Pubkey,
    pub seller: Pubkey,
}

impl Auction {
    pub const LEN: usize = 264;
}
