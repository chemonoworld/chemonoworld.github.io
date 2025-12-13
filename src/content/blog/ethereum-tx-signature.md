---
title: 'Ethereum Tx Type & Signature'
description: 'Analysis of Ethereum Transaction Types (Legacy, AccessList, DynamicFee, BlobTx) and ECDSA signature recovery.'
pubDate: 'Aug 02 2024'
tags: ['ethereum', 'blockchain', 'cryptography', 'golang']
---

# Tx type별 특징

## 1. LegacyTx(EIP-155)

- 구조: nonce, gasPrice, gasLimit, to, value, data, v, r, s
- 특징:
    - 사용자가 직접 gasPrice를 설정
    - 모든 이더리움 클라이언트에서 지원
- 제한점: 가스 가격 예측이 어려움

```go
type LegacyTx struct {
	Nonce     uint64          `json:"nonce"`
	GasPrice  *big.Int        `json:"gasPrice"`
	Gas       uint64          `json:"gas"`
	To        *common.Address `json:"to"`
	Value     *big.Int        `json:"value"`
	Data      []byte          `json:"data"`
	V         *big.Int        `json:"v"`
	R         *big.Int        `json:"r"`
	S         *big.Int        `json:"s"`
}
```

```go
rlp([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
```

https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md

## 2. AccessListTx(EIP-2930)

- LegacyTx의 모든 필드를 포함하며, 추가로 accessList 필드가 추가됨
- 특징:
    - AccessList을 통해 가스 비용 최적화
    - 트랜잭션 실패 위험 감소
    - 여전히 사용자가 gasPrice를 설정
- 장점: 복잡한 컨트랙트 상호작용에서 효율적

```go
type AccessListTx struct {
	ChainID    *big.Int        `json:"chainId"`
	Nonce      uint64          `json:"nonce"`
	GasPrice   *big.Int        `json:"gasPrice"`
	Gas        uint64          `json:"gas"`
	To         *common.Address `json:"to"`
	Value      *big.Int        `json:"value"`
	Data       []byte          `json:"data"`
	AccessList AccessList      `json:"accessList"`
	V          *big.Int        `json:"v"`
	R          *big.Int        `json:"r"`
	S          *big.Int        `json:"s"`
}
```

```go
0x01 || rlp([chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, signatureYParity, signatureR, signatureS])
```

## 3. DynamicFeeTx(EIP-1559)

- 구조: 기존 필드 + maxFeePerGas, maxPriorityFeePerGas (gasPrice 대체)
- 특징:
    - 기본 요금(base fee)과 우선 순위 요금(priority fee) 개념 도입
    - 동적인 가스 가격 메커니즘
    - 더 예측 가능한 가스 비용
- 장점:
    - 네트워크 혼잡 시 더 효율적인 가격 책정
    - 사용자 경험 개선

```go
type DynamicFeeTx struct {
	ChainID    *big.Int        `json:"chainId"`
	Nonce      uint64          `json:"nonce"`
	GasTipCap  *big.Int        `json:"maxPriorityFeePerGas"`
	GasFeeCap  *big.Int        `json:"maxFeePerGas"`
	Gas        uint64          `json:"gas"`
	To         *common.Address `json:"to"`
	Value      *big.Int        `json:"value"`
	Data       []byte          `json:"data"`
	AccessList AccessList      `json:"accessList"`
	V          *big.Int        `json:"v"`
	R          *big.Int        `json:"r"`
	S          *big.Int        `json:"s"`
}

```

```
0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, signatureYParity, signatureR, signatureS])
```

## 4. BlobTx(EIP-4844)

EIP-4844는 "Shard Blob Transactions"라는 제목으로 제안됨. (Proto-Danksharding)

- 주요 특징:
    - Blob: 'Binary Large Object'의 약자로, 대량의 데이터를 저장할 수 있는 새로운 데이터 구조를 도입
        - validator는 KZG commitment를 사용하여 Blob 데이터의 무결성을 빠르게 확인가능
    - 데이터 가용성(DA): 블롭은 메인 이더리움 체인에 영구적으로 저장되지 않고, 제한된 시간 동안만 유지
    - 롤업 최적화: 주로 롤업(Layer 2 솔루션)의 효율성을 크게 향상시키기 위해 설계.
    - 가스 비용 절감: 대용량 데이터를 처리하는 데 필요한 가스 비용을 크게 줄일 수 있음.
- 인코딩 과정
    - Blob 데이터를 KZG commitment로 변환
    - commitment에 버전 정보를 추가하여 해시 생성
    - 해시를 트랜잭션에 포함
    - 트랜잭션을 RLP 인코딩
- 트랜잭션 추가된 필드
    - `max_fee_per_data_gas`: Blob 데이터에 대한 최대 가스 가격
    - `blob_versioned_hashes`: Blob의 버전이 포함된 해시 목록

```go
type BlobTx struct {
	ChainID    *uint256.Int
	Nonce      uint64
	GasTipCap  *uint256.Int // a.k.a. maxPriorityFeePerGas
	GasFeeCap  *uint256.Int // a.k.a. maxFeePerGas
	Gas        uint64
	To         common.Address
	Value      *uint256.Int
	Data       []byte
	AccessList AccessList
	BlobFeeCap *uint256.Int // a.k.a. maxFeePerBlobGas
	BlobHashes []common.Hash

	// A blob transaction can optionally contain blobs. This field must be set when BlobTx
	// is used to create a transaction for signing.
	Sidecar *BlobTxSidecar `rlp:"-"`

	// Signature values
	V *uint256.Int `json:"v" gencodec:"required"`
	R *uint256.Int `json:"r" gencodec:"required"`
	S *uint256.Int `json:"s" gencodec:"required"`
}
```

```go
0x03 || rlp([
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    to,
    value,
    data,
    accessList,
    maxFeePerDataGas,
    blobVersionedHashes,
    signatureYParity,
    signatureR,
    signatureS
])
```

## 5. Transaction 구조 및 tx RLP encoding 코드

- Transaction 구조

```go
type Transaction struct {
	inner TxData    // Consensus contents of a transaction
	time  time.Time // Time first seen locally (spam avoidance)

	// caches
	hash atomic.Pointer[common.Hash]
	size atomic.Uint64
	from atomic.Pointer[sigCache]
}

type TxData interface {
	txType() byte // returns the type ID
	copy() TxData // creates a deep copy and initializes all fields

	chainID() *big.Int
	accessList() AccessList
	data() []byte
	gas() uint64
	gasPrice() *big.Int
	gasTipCap() *big.Int
	gasFeeCap() *big.Int
	value() *big.Int
	nonce() uint64
	to() *common.Address

	rawSignatureValues() (v, r, s *big.Int)
	setSignatureValues(chainID, v, r, s *big.Int)

	// effectiveGasPrice computes the gas price paid by the transaction, given
	// the inclusion block baseFee.
	//
	// Unlike other TxData methods, the returned *big.Int should be an independent
	// copy of the computed value, i.e. callers are allowed to mutate the result.
	// Method implementations can use 'dst' to store the result.
	effectiveGasPrice(dst *big.Int, baseFee *big.Int) *big.Int

	encode(*bytes.Buffer) error
	decode([]byte) error
}
```

- 다음은 Transaction의 Hash 메서드의 구현

```go
func (tx *Transaction) Hash() common.Hash {
	if hash := tx.hash.Load(); hash != nil {
		return *hash
	}

	var h common.Hash
	if tx.Type() == LegacyTxType {
		h = rlpHash(tx.inner)
	} else {
		h = prefixedRlpHash(tx.Type(), tx.inner)
	}
	tx.hash.Store(&h)
	return h
}
```

```go
func prefixedRlpHash(prefix byte, x interface{}) (h common.Hash) {
	sha := hasherPool.Get().(crypto.KeccakState)
	defer hasherPool.Put(sha)
	sha.Reset()
	sha.Write([]byte{prefix})
	rlp.Encode(sha, x)
	sha.Read(h[:])
	return h
}
```

# ECDSA ecrecover 기능

## 1. 비대칭키 암호화 서명의 검증

- signature 생성의 경우 개인키와, 메시지(hash)를 통해 생성
- verify method의 경우 일반적으로 공개키와, 메시지(hash), signature의 3개의 parameter가 필요
- EdDSA(Edwards-Curve Digital Signature Algorithm; ed25519 or ed488) 또는 Schnorrkel/Ristretto x25519(sr25519)와 달리 ECDSA(secp256k1)는 recoverPubkey or ecrecover와 같이 signature와 메시지(hash)로부터 pubkey를 복구하는 기능을 지원

## 2. 코드를 통해 확인하기

### evmos의 Tx msg

- 민트스캔 링크
    - [https://www.mintscan.io/evmos/tx/ce2a75e27a92d7ed26fe89b2eebc713c58eea81f938bd7e84155326bca7ad5af/?height=22460308](https://www.mintscan.io/evmos/tx/ce2a75e27a92d7ed26fe89b2eebc713c58eea81f938bd7e84155326bca7ad5af/?height=22460308)

```json
"msg": {
        "txHash": "ce2a75e27a92d7ed26fe89b2eebc713c58eea81f938bd7e84155326bca7ad5af",
        "code": 5,
        "height": 22460308,
        "time": 1722256590257,
        "chainId": "evmos_9001-2",
        "chainIdentifier": "evmos_9001",
        "relation": "error",
        "msgIndex": 0,
        "msg": {
          "@type": "/ethermint.evm.v1.MsgEthereumTx",
          "data": {
            "@type": "/ethermint.evm.v1.DynamicFeeTx", // txType === 2
            "chain_id": "9001",
            "nonce": "6408",
            "gas_tip_cap": "27500000000",
            "gas_fee_cap": "27500000000",
            "gas": "700000",
            "to": "0x2A9C55b6Dc56da178f9f9a566F1161237b73Ba66",
            "value": "96250000000000000000",
            "data": "k3xUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACcQ",
            "accesses": [ ],
            "v": null, // 0
            "r": "CB4oyKpB+4Yg07dyy2wI9A57fJtlN2vgkBrpJa9FNt0=",
            "s": "WlvzV0aE9+GZ92SjneqA9zPuTU0bLnqUgDJzY2NhXGE="
          },
          "size": 0,
          "hash": "0xb8bc6e9e090cc12a15129f208022af5a41452e807c4586a43491b40bc944f83f",
          "from": ""
        },
        "eventStartIndex": 0,
        "eventEndIndex": 0,
        "search": "",
        "meta": {
          "error": "Invalid bech32PrefixAccAddr"
        }
      },
      "prices": { }
    }
```

### 코드

from address: 0x7500A226f292156c63176a89BeA7F95335B4E0e2

7500a226f292156c63176a89bea7f95335b4e0e2

[https://github.com/chemonoworld/ts-ecrecover-test.git](https://github.com/chemonoworld/ts-ecrecover-test.git)

```tsx
import * as secp from '@noble/secp256k1';
import {PubKeySecp256k1, Hash} from '@keplr-wallet/crypto'
import {utils, UnsignedTransaction} from 'ethers'

const start = async() => {
    const data = {
        "@type": "/ethermint.evm.v1.DynamicFeeTx",
        "chain_id": "9001",
        "nonce": "6408",
        "gas_tip_cap": "27500000000",
        "gas_fee_cap": "27500000000",
        "gas": "700000",
        "to": "0x2A9C55b6Dc56da178f9f9a566F1161237b73Ba66",
        "value": "96250000000000000000",
        "data": "k3xUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACcQ",
        "accesses": [ ],
        "v": null,
        "r": "CB4oyKpB+4Yg07dyy2wI9A57fJtlN2vgkBrpJa9FNt0=",
        "s": "WlvzV0aE9+GZ92SjneqA9zPuTU0bLnqUgDJzY2NhXGE="
    };
    // additional tx msg data
    // "txHash": "ce2a75e27a92d7ed26fe89b2eebc713c58eea81f938bd7e84155326bca7ad5af",
    // "code": 5,
    // "height": 22460308,
    // "time": 1722256590257,
    // "chainId": "evmos_9001-2",
    // "chainIdentifier": "evmos_9001",
    // "size": 0,
    // "hash": "0xb8bc6e9e090cc12a15129f208022af5a41452e807c4586a43491b40bc944f83f",
    // "from": ""

    // mintscan
    // https://www.mintscan.io/evmos/tx/ce2a75e27a92d7ed26fe89b2eebc713c58eea81f938bd7e84155326bca7ad5af/?height=22460308

    const {r, s, v} = data;
    console.log("r: ", Buffer.from(r, 'base64').toString('hex'))
    console.log("s: ",Buffer.from(s, 'base64').toString('hex'))
    const signatureBuffer = Buffer.concat([Buffer.from(r, 'base64'), Buffer.from(s, 'base64')]);
    const signature = secp.Signature.fromCompact(signatureBuffer);
    const rec = v === null ? parseInt(Buffer.alloc(1, 0x0).toString('hex'), 16) : parseInt(Buffer.from(v, 'base64').toString('hex'), 16);
    console.log("recovery: ", rec)
    const signatureWithRecovery = signature.addRecoveryBit(rec);

    const transaction: UnsignedTransaction = {
        type: 2, // DynamicFeeTx
        chainId: Number(data.chain_id),
        nonce: Number(data.nonce),
        maxPriorityFeePerGas: BigInt(data.gas_tip_cap),
        maxFeePerGas: BigInt(data.gas_fee_cap),
        gasLimit: BigInt(data.gas),
        to: data.to,
        value: BigInt(data.value),
        data: Buffer.from(data.data, 'base64'),
        accessList: [...data.accesses],
    }

    const serialized = utils.serializeTransaction(transaction);
    console.log("serialized: ",serialized)
    const encoded = Buffer.from(serialized.slice(2), 'hex')

    const prefixedMsg = utils.concat([encoded]);
    const hash = utils.keccak256(new Uint8Array(Buffer.from(prefixedMsg))).slice(2)

    const pubkey = signatureWithRecovery.recoverPublicKey(hash);
    const hexPubkey = pubkey.toHex();
    console.log("hex pubkey: ", hexPubkey)
    const pubkeyBuffer = Buffer.from(hexPubkey, 'hex')

    const keplrPubkey = new PubKeySecp256k1(pubkeyBuffer);
    const hexAddress = Buffer.from(keplrPubkey.getEthAddress()).toString('hex')
    console.log("hex address: ", hexAddress)
}   

start();
```
