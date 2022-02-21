use anchor_lang::prelude::*;
use anchor_spl::token::{self, Approve, Mint, TokenAccount, Transfer};

mod state;
pub use state::Auction;

mod error;
pub use error::BiddingError;

declare_id!("DgS9UGdBZCZ33J5PSNUnzrEUUQknTpx1LYGzWBaWHn9P");

#[program]
pub mod bidding {
    use super::*;

    pub fn listing(ctx: Context<Listing>, amount: u64, min_price: u64) -> ProgramResult {
        if ctx.accounts.asset_mint.decimals != 0 {
            return Err(BiddingError::AssetInvalidError.into());
        }

        let auction = &mut ctx.accounts.auction_account;
        auction.min_price = min_price;
        auction.seller = *ctx.accounts.seller.to_account_info().key;
        auction.bidder_acc = None;
        auction.highest_bid = 0;
        auction.payment_mint = *ctx.accounts.payment_mint.to_account_info().key;
        auction.asset_acc = *ctx.accounts.asset_acc.to_account_info().key;
        auction.deposit_acc = *ctx.accounts.deposit_bid_acc.to_account_info().key;

        if ctx.accounts.asset_acc.mint != *ctx.accounts.asset_mint.to_account_info().key {
            return Err(BiddingError::InvalidAccountError.into());
        }

        // approve bidding program to transfer asset
        let approve = Approve {
            to: ctx.accounts.asset_acc.to_account_info().clone(),
            delegate: ctx.accounts.auction_account.to_account_info().clone(),
            authority: ctx.accounts.seller.to_account_info().clone(),
        };
        let approve_ctx = CpiContext::new(ctx.accounts.token_program.clone(), approve);
        token::approve(approve_ctx, amount)?;

        Ok(())
    }

    pub fn bid(ctx: Context<Bid>, amount: u64) -> ProgramResult {
        if ctx.accounts.bidding_account.mint != ctx.accounts.auction_account.payment_mint {
            return Err(BiddingError::InvalidAccountError.into());
        }

        if ctx.accounts.bidding_account.amount < ctx.accounts.auction_account.highest_bid
            || ctx.accounts.bidding_account.amount < amount
        {
            return Err(BiddingError::InsufficientAccountError.into());
        }

        let auction = &mut ctx.accounts.auction_account;
        let auction_seed = auction.asset_acc.to_bytes();


        let (auction_pda, auction_bump) = Pubkey::find_program_address(
            &[&auction_seed], ctx.program_id
        );
        let auction_auth = &[&auction_seed[..], &[auction_bump]];

        if auction_pda != *auction.to_account_info().key {
            return Err(BiddingError::InvalidAccountError.into());
        }

        if let Some(bidder_acc) = auction.bidder_acc {
            if bidder_acc != *ctx.accounts.last_bidder_acc.to_account_info().key {
                return Err(BiddingError::InvalidLastBidAccount.into());
            }

            let return_bid = Transfer {
                from: ctx.accounts.deposit_bid_acc.to_account_info().clone(),
                to: ctx.accounts.last_bidder_acc.to_account_info().clone(),
                authority: auction.to_account_info().clone(),
            };
            let return_bid_ctx = CpiContext::new(
                ctx.accounts.token_program.clone(), return_bid);
            token::transfer(return_bid_ctx.with_signer(&[&auction_auth[..]]), auction.highest_bid)?;
        }

        let deposit_bid = Transfer {
            from: ctx.accounts.bidding_account.to_account_info().clone(),
            to: ctx.accounts.deposit_bid_acc.to_account_info().clone(),
            authority: ctx.accounts.bidder.to_account_info().clone(),
        };
        let deposit_bid_ctx = CpiContext::new(ctx.accounts.token_program.clone(), deposit_bid);
        token::transfer(deposit_bid_ctx, amount)?;

        auction.highest_bid = amount;
        auction.bidder_acc = Some(*ctx.accounts.bidding_account.to_account_info().key);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Listing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    pub payment_mint: Account<'info, Mint>,
    pub asset_mint: Account<'info, Mint>,
    #[account(mut)]
    pub asset_acc: Account<'info, TokenAccount>,
    pub token_program: AccountInfo<'info>,
    #[account(
        init, payer = seller, space = Auction::LEN, 
        seeds = [&asset_acc.to_account_info().key.to_bytes()], bump
    )]
    pub auction_account: Account<'info, Auction>,
    #[account(
        init, payer = seller,
        seeds = [&auction_account.to_account_info().key.to_bytes()], bump,
        token::mint = payment_mint,
        token::authority = auction_account
    )]
    pub deposit_bid_acc: Account<'info, TokenAccount>,
    pub rent: Sysvar<'info, Rent>,
    #[account(address = System::id())]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub payment_mint: Account<'info, Mint>,
    #[account(mut)]
    pub bidding_account: Account<'info, TokenAccount>,
    pub token_program: AccountInfo<'info>,
    #[account(mut)]
    pub auction_account: Account<'info, Auction>,
    #[account(mut)]
    pub last_bidder_acc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub deposit_bid_acc: Account<'info, TokenAccount>,
    #[account(address = System::id())]
    pub system_program: Program<'info, System>,
}
