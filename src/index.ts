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
  MetadataArgs,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createTransferInstruction,
  getLeafAssetId,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  Key,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
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

  // const treeAddress = await createAndInitializeTree(
  //   connection,
  //   wallet,
  //   maxDepthSizePair,
  //   canopyDepth
  // );

  // const collectionNft = await getOrCreateCollectionNFT(connection, wallet);

  // await mintCompressedNftToCollection(
  //   connection,
  //   wallet,
  //   treeAddress,
  //   collectionNft,
  //   2 ** maxDepthSizePair.maxDepth
  // );

  await logNftDetails(
    new PublicKey("9XryH5c1cWBBSdtUBFcUDikswfbLv9p52K6xA1WoBFGt"),
    8
  );
}

async function logNftDetails(treeAddress: PublicKey, nftsMinted: number) {
  for (let i = 0; i < nftsMinted; i++) {
    const assetId = await getLeafAssetId(treeAddress, new BN(i));
    console.log("Asset ID:", assetId.toBase58());
    const response = await fetch(
      "https://rpc-devnet.helius.xyz/?api-key=987330c2-6ef1-497e-b562-b5e5bdcaf9df",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "my-id",
          method: "getAsset",
          params: {
            id: assetId,
          },
        }),
      }
    );
    const { result } = await response.json();
    console.log(JSON.stringify(result, null, 2));
  }
}

async function mintCompressedNftToCollection(
  connection: Connection,
  payer: Keypair,
  treeAddress: PublicKey,
  collectionDetails: CollectionDetails,
  amount: number
) {
  const treeAuthority = PublicKey.findProgramAddressSync(
    [treeAddress.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  )[0];

  const bubblegumSigner = PublicKey.findProgramAddressSync(
    [Buffer.from("collection_cpi")],
    BUBBLEGUM_PROGRAM_ID
  )[0];

  for (let i = 0; i < amount; i++) {
    const nftMetadata = createNftMetadata(payer.publicKey, i);

    const instruction = createMintToCollectionV1Instruction(
      {
        treeAuthority: treeAuthority,
        leafOwner: payer.publicKey,
        leafDelegate: payer.publicKey,
        merkleTree: treeAddress,
        payer: payer.publicKey,
        treeDelegate: payer.publicKey,
        collectionAuthority: payer.publicKey,
        collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
        collectionMint: collectionDetails.mint,
        collectionMetadata: collectionDetails.metadata,
        editionAccount: collectionDetails.masterEditionAccount,
        bubblegumSigner: bubblegumSigner,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      },
      {
        metadataArgs: Object.assign(nftMetadata, {
          collection: {
            key: collectionDetails.mint,
            verified: false,
          },
        }),
      }
    );

    try {
      const tx = new Transaction().add(instruction);

      tx.feePayer = payer.publicKey;

      const txSignature = await sendAndConfirmTransaction(
        connection,
        tx,
        [payer],
        {
          commitment: "confirmed",
          skipPreflight: true,
        }
      );

      console.log(
        `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
      );
    } catch (err) {
      console.error("\nFailed to mint compressed NFT:", err);
      throw err;
    }
  }
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
