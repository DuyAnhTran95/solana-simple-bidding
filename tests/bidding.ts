import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Bidding } from "../target/types/bidding";
import { readFileSync } from "fs";
import * as chai from "chai";
import { expect } from "chai";
const chaiAsPromised = require("chai-as-promised");

require("dotenv").config();
chai.use(chaiAsPromised);

const expect = chai.expect;

const idl = JSON.parse(readFileSync("./target/idl/bidding.json", "utf-8"));

const secretKey = Uint8Array.from(
  JSON.parse(readFileSync(process.env.PAYER_PK, "utf-8"))
);

describe("bidding", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const provider = anchor.getProvider();

  const program = anchor.workspace.Bidding as Program<Bidding>;
  const seller = anchor.web3.Keypair.generate();
  const buyer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));

  let paymentMint: Token, assetMint: Token;

  /**
   * create newly minted account for keypair
   * @param user
   * @param amount
   * @returns newly minted token account
   */
  async function mintFor(
    user: anchor.web3.Keypair,
    amount: number
  ): Promise<PublicKey> {
    const userPaymentAcc = await paymentMint.createAccount(user.publicKey);

    await paymentMint.mintTo(
      userPaymentAcc,
      mintAuthority.publicKey,
      [mintAuthority],
      amount
    );

    return userPaymentAcc;
  }

  async function mint(): Promise<{
    sellerAssetAcc: PublicKey;
    paymentAcc: PublicKey;
  }> {
    const sellerAssetAcc = await assetMint.createAccount(seller.publicKey);
    const paymentAcc = await paymentMint.createAccount(buyer.publicKey);

    await assetMint.mintTo(
      sellerAssetAcc,
      mintAuthority.publicKey,
      [mintAuthority],
      1
    );

    await paymentMint.mintTo(
      paymentAcc,
      mintAuthority.publicKey,
      [mintAuthority],
      1000
    );

    return {
      sellerAssetAcc,
      paymentAcc,
    };
  }

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(seller.publicKey, 10000000000),
      "processed"
    );

    paymentMint = await Token.createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      mintAuthority.publicKey,
      6,
      TOKEN_PROGRAM_ID
    );

    assetMint = await Token.createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      mintAuthority.publicKey,
      0,
      TOKEN_PROGRAM_ID
    );
  });

  it("can list asset", async () => {
    let { sellerAssetAcc, paymentAcc } = await mint();

    seller.publicKey.toBuffer();

    const [auctionPDA] = await PublicKey.findProgramAddress(
      [sellerAssetAcc.toBuffer()],
      program.programId
    );

    const [depositPDA] = await PublicKey.findProgramAddress(
      [auctionPDA.toBuffer()],
      program.programId
    );

    await program.rpc.listing(new anchor.BN(1), new anchor.BN(100), {
      accounts: {
        assetAcc: sellerAssetAcc,
        assetMint: assetMint.publicKey,
        auctionAccount: auctionPDA,
        depositBidAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [seller],
    });

    let sellerAssetAccInfo = await assetMint.getAccountInfo(sellerAssetAcc);
    let auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(sellerAssetAccInfo.delegate.toBase58()).equals(
      auctionPDA.toBase58()
    );
    expect(sellerAssetAccInfo.delegatedAmount.toString()).equals("1");
    expect(auctionAccInfo.minPrice.toString()).equals("100");
    expect(auctionAccInfo.paymentMint.toBase58()).equals(
      paymentMint.publicKey.toBase58()
    );
  });

  it("can list multiple assets", async () => {
    let { sellerAssetAcc, paymentAcc } = await mint();
    let { sellerAssetAcc: sellerAssetAcc2, paymentAcc: paymentAcc2 } =
      await mint();

    seller.publicKey.toBuffer();

    const [auctionPDA] = await PublicKey.findProgramAddress(
      [sellerAssetAcc.toBuffer()],
      program.programId
    );

    const [depositPDA] = await PublicKey.findProgramAddress(
      [auctionPDA.toBuffer()],
      program.programId
    );

    const [auctionPDA2] = await PublicKey.findProgramAddress(
      [sellerAssetAcc2.toBuffer()],
      program.programId
    );

    const [depositPDA2] = await PublicKey.findProgramAddress(
      [auctionPDA2.toBuffer()],
      program.programId
    );

    await program.rpc.listing(new anchor.BN(1), new anchor.BN(100), {
      accounts: {
        assetAcc: sellerAssetAcc,
        assetMint: assetMint.publicKey,
        auctionAccount: auctionPDA,
        depositBidAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [seller],
    });

    await program.rpc.listing(new anchor.BN(1), new anchor.BN(200), {
      accounts: {
        assetAcc: sellerAssetAcc2,
        assetMint: assetMint.publicKey,
        auctionAccount: auctionPDA2,
        depositBidAcc: depositPDA2,
        paymentMint: paymentMint.publicKey,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [seller],
    });

    let sellerAssetAccInfo = await assetMint.getAccountInfo(sellerAssetAcc);
    let auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(sellerAssetAccInfo.delegate.toBase58()).equals(
      auctionPDA.toBase58()
    );
    expect(sellerAssetAccInfo.delegatedAmount.toString()).equals("1");
    expect(auctionAccInfo.minPrice.toString()).equals("100");
    expect(auctionAccInfo.paymentMint.toBase58()).equals(
      paymentMint.publicKey.toBase58()
    );

    let sellerAssetAccInfo2 = await assetMint.getAccountInfo(sellerAssetAcc2);
    let auctionAccInfo2 = await program.account.auction.fetch(auctionPDA2);

    expect(sellerAssetAccInfo2.delegate.toBase58()).equals(
      auctionPDA2.toBase58()
    );
    expect(sellerAssetAccInfo2.delegatedAmount.toString()).equals("1");
    expect(auctionAccInfo2.minPrice.toString()).equals("200");
    expect(auctionAccInfo2.paymentMint.toBase58()).equals(
      paymentMint.publicKey.toBase58()
    );
  });

  it("can bids", async () => {
    let { sellerAssetAcc, paymentAcc } = await mint();

    seller.publicKey.toBuffer();

    const [auctionPDA, bump] = await PublicKey.findProgramAddress(
      [sellerAssetAcc.toBuffer()],
      program.programId
    );

    const [depositPDA] = await PublicKey.findProgramAddress(
      [auctionPDA.toBuffer()],
      program.programId
    );

    await program.rpc.listing(new anchor.BN(1), new anchor.BN(100), {
      accounts: {
        assetAcc: sellerAssetAcc,
        assetMint: assetMint.publicKey,
        auctionAccount: auctionPDA,
        depositBidAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [seller],
    });

    let sellerAssetAccInfo = await assetMint.getAccountInfo(sellerAssetAcc);
    let auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(sellerAssetAccInfo.delegate.toBase58()).equals(
      auctionPDA.toBase58()
    );
    expect(sellerAssetAccInfo.delegatedAmount.toString()).equals("1");
    expect(auctionAccInfo.minPrice.toString()).equals("100");
    expect(auctionAccInfo.paymentMint.toBase58()).equals(
      paymentMint.publicKey.toBase58()
    );
    expect(auctionAccInfo.seller.toBase58()).equals(
      seller.publicKey.toBase58()
    );

    await program.rpc.bid(new anchor.BN(240), {
      accounts: {
        auctionAccount: auctionPDA,
        bidder: buyer.publicKey,
        biddingAccount: paymentAcc,
        depositBidAcc: depositPDA,
        lastBidderAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [buyer],
    });

    const depositAccInfo = await paymentMint.getAccountInfo(depositPDA);
    auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(depositAccInfo.amount.toString()).equals("240");
    expect(auctionAccInfo.depositAcc.toBase58()).equals(depositPDA.toBase58());
    expect(auctionAccInfo.bidderAcc.toBase58()).equals(paymentAcc.toBase58());
  });

  it("can bids higher", async () => {
    let { sellerAssetAcc, paymentAcc } = await mint();

    seller.publicKey.toBuffer();

    const [auctionPDA, bump] = await PublicKey.findProgramAddress(
      [sellerAssetAcc.toBuffer()],
      program.programId
    );

    const [depositPDA] = await PublicKey.findProgramAddress(
      [auctionPDA.toBuffer()],
      program.programId
    );

    await program.rpc.listing(new anchor.BN(1), new anchor.BN(100), {
      accounts: {
        assetAcc: sellerAssetAcc,
        assetMint: assetMint.publicKey,
        auctionAccount: auctionPDA,
        depositBidAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [seller],
    });

    let sellerAssetAccInfo = await assetMint.getAccountInfo(sellerAssetAcc);
    let auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(sellerAssetAccInfo.delegate.toBase58()).equals(
      auctionPDA.toBase58()
    );
    expect(sellerAssetAccInfo.delegatedAmount.toString()).equals("1");
    expect(auctionAccInfo.minPrice.toString()).equals("100");
    expect(auctionAccInfo.paymentMint.toBase58()).equals(
      paymentMint.publicKey.toBase58()
    );
    expect(auctionAccInfo.seller.toBase58()).equals(
      seller.publicKey.toBase58()
    );

    await program.rpc.bid(new anchor.BN(240), {
      accounts: {
        auctionAccount: auctionPDA,
        bidder: buyer.publicKey,
        biddingAccount: paymentAcc,
        depositBidAcc: depositPDA,
        lastBidderAcc: depositPDA,
        paymentMint: paymentMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [buyer],
    });

    let depositAccInfo = await paymentMint.getAccountInfo(depositPDA);
    auctionAccInfo = await program.account.auction.fetch(auctionPDA);

    expect(depositAccInfo.amount.toString()).equals("240");
    expect(auctionAccInfo.depositAcc.toBase58()).equals(depositPDA.toBase58());
    expect(auctionAccInfo.bidderAcc.toBase58()).equals(paymentAcc.toBase58());

    let highestBidder = anchor.web3.Keypair.generate();

    let highBidderPaymentAcc = await mintFor(highestBidder, 1000);

    await program.rpc.bid(new anchor.BN(250), {
      accounts: {
        auctionAccount: auctionPDA,
        bidder: highestBidder.publicKey,
        biddingAccount: highBidderPaymentAcc,
        depositBidAcc: depositPDA,
        lastBidderAcc: auctionAccInfo.bidderAcc,
        paymentMint: paymentMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [highestBidder],
    });

    depositAccInfo = await paymentMint.getAccountInfo(depositPDA);
    auctionAccInfo = await program.account.auction.fetch(auctionPDA);
    const lastBidderPaymentAcc = await paymentMint.getAccountInfo(paymentAcc);

    expect(lastBidderPaymentAcc.amount.toString()).equals("1000");
    expect(depositAccInfo.amount.toString()).equals("250");
    expect(auctionAccInfo.depositAcc.toBase58()).equals(depositPDA.toBase58());
    expect(auctionAccInfo.bidderAcc.toBase58()).equals(highBidderPaymentAcc.toBase58());
  });
});
