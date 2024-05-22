import fetch from "node-fetch";
import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  airdropSolIfNeeded,
  getOrCreateKeypair,
  createNftMetadata,
  CollectionDetails,
  getOrCreateCollectionNFT,
} from "./utils";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  ValidDepthSizePair,
  createAllocTreeIx,
  SPL_NOOP_PROGRAM_ID,
  ConcurrentMerkleTreeAccount,
} from "@solana/spl-account-compression";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createTransferInstruction,
  getLeafAssetId,
} from "@metaplex-foundation/mpl-bubblegum";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { BN } from "@project-serum/anchor";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = await getOrCreateKeypair("Wallet_1");
  airdropSolIfNeeded(wallet.publicKey);

  const maxDepthSizePair: ValidDepthSizePair = {
    maxDepth: 3,
    maxBufferSize: 8,
  };

  const canopyDepth = 0;

  const treeAddress = await createAndInitializeTree(
    connection,
    wallet,
    maxDepthSizePair,
    canopyDepth
  );
}

async function createAndInitializeTree(
  connection: Connection,
  payer: Keypair,
  maxDepthSizePair: ValidDepthSizePair,
  canopyDepth
) {
  const treeKeypair = Keypair.generate();

  const allocAccountIx = await createAllocTreeIx(
    connection,
    treeKeypair.publicKey,
    payer.publicKey,
    maxDepthSizePair,
    canopyDepth
  );

  const [treeConfigPDA] = PublicKey.findProgramAddressSync(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const instruction = createCreateTreeInstruction(
    {
      treeAuthority: treeConfigPDA,
      merkleTree: treeKeypair.publicKey,
      payer: payer.publicKey,
      treeCreator: payer.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxBufferSize: maxDepthSizePair.maxBufferSize,
      maxDepth: maxDepthSizePair.maxDepth,
      public: false,
    }
  );

  const tx = new Transaction().add(allocAccountIx, instruction);
  tx.feePayer = payer.publicKey;

  try {
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      [treeKeypair, payer],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );

    console.log(`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

    console.log("Tree Address:", treeKeypair.publicKey.toBase58());

    return treeKeypair.publicKey;
  } catch (err: any) {
    console.error("\nFailed to create Merkle tree:", err);
    throw err;
  }
}

// Demo Code Here

main();
