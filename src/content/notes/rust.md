---
title: "Sorting methods in Rust"
description: "Rust slice 정렬 메서드들의 stable/unstable, comparator/key, 공간복잡도 차이 정리."
pubDate: 2026-05-07
category: "TIL"
tags: ["Rust", "programming", "algorithms"]
---

Rust의 `Vec<T>` 정렬 메서드는 실제로 `Vec` 자체 메서드라기보다 slice 메서드다. `Vec<T>`가 `&mut [T]`로 deref되기 때문에 `v.sort()`처럼 호출할 수 있다.

크게 보면 축이 두 개다.

- stable vs unstable: 같은 값으로 비교되는 원소들의 기존 상대 순서를 유지하는가
- natural order vs comparator vs key: `Ord` 그대로 쓸지, 비교 함수를 줄지, key 추출 함수를 줄지

## 전체 요약

| method | 기준 | stable? | key/cache | time | extra space |
| --- | --- | --- | --- | --- | --- |
| `sort` | `T: Ord` | stable | 없음 | `O(n log n)` worst-case | `O(n)` |
| `sort_by` | comparator | stable | 없음 | `O(n log n)` worst-case | `O(n)` |
| `sort_by_key` | key function | stable | key 매 비교 때 계산 | `O(m * n log n)` worst-case | `O(n)` |
| `sort_by_cached_key` | key function | stable | key를 한 번씩 캐시 | `O(m * n + n log n)` worst-case | `O(n)` + key 저장 |
| `sort_unstable` | `T: Ord` | unstable | 없음 | `O(n log n)` worst-case | `O(1)` |
| `sort_unstable_by` | comparator | unstable | 없음 | `O(n log n)` worst-case | `O(1)` |
| `sort_unstable_by_key` | key function | unstable | key 매 비교 때 계산 | `O(n log n)` worst-case, key 비용은 별도 | `O(1)` |

여기서 `m`은 key function 한 번 실행 비용

## Stable 계열

stable sort는 비교 결과가 같은 원소들의 기존 순서를 보존함

```rust
items.sort_by(|a, b| a.score.cmp(&b.score));
```

### `sort`

`T: Ord`가 구현된 타입을 기본 오름차순으로 정렬함. 주의할점은 `내림차순 지원 안함`

```rust
let mut xs = vec![3, 1, 2];
xs.sort();
```

### `sort_by`

비교 함수를 직접 넘긴다. 반환 타입은 `std::cmp::Ordering`.

```rust
items.sort_by(|a, b| a.score.cmp(&b.score));
```

내림차순은 비교 순서를 뒤집으면 됨.

```rust
items.sort_by(|a, b| b.score.cmp(&a.score));
```

비교 함수는 total order를 만들어야 한다. 특히 float를 정렬할 때 `partial_cmp(...).unwrap()`은 `NaN`이 섞이면 터질 수 있으니, 필요한 경우 `f32::total_cmp`나 `f64::total_cmp`를 쓰는 게 낫다.

`NaN`은 `0.0 / 0.0`, `infinity - infinity`, 음수의 `sqrt()` 같은 "숫자로 표현할 수 없는 결과"에서 생긴다. 일반 비교에서는 `NaN < 1.0`, `NaN > 1.0`, `NaN == NaN`이 전부 `false`라서 `partial_cmp`가 `None`을 반환한다. 반면 `total_cmp`는 `NaN`, `-0.0`, `+0.0`, infinity까지 포함해서 정렬 가능한 순서를 만든다. 보통 `f64::NAN` 같은 positive quiet NaN은 오름차순에서 맨 뒤쪽으로 감

### `sort_by_key`

각 원소에서 정렬 key를 뽑아서 그 key의 `Ord`로 정렬한다.

```rust
items.sort_by_key(|item| item.score);
```

읽기는 제일 좋다. 다만 key function이 비교 중 여러 번 호출될 수 있다. key 계산이 싸면 보통 이게 편하다.

### `sort_by_cached_key`

key를 원소마다 한 번씩만 계산해서 캐시한 뒤 정렬한다.

```rust
items.sort_by_cached_key(|item| expensive_key(item));
```

key 계산이 비싸면 `sort_by_key`보다 유리할 수 있다. 대신 key를 저장해야 해서 추가 메모리를 더 쓴다. 즉, "계산을 줄이고 메모리를 더 쓰는" 선택지다.

## Unstable 계열

unstable sort는 같은 값으로 비교되는 원소들의 기존 순서를 보존하지 않는다.

대신 Rust 문서 기준으로 unstable 계열은 in-place이고 allocation하지 않는다. 공간복잡도만 보면 stable 계열보다 유리하다.

### `sort_unstable`

`T: Ord` 기준으로 정렬하되, 같은 값의 상대 순서는 보장하지 않는다.

```rust
let mut xs = vec![3, 1, 2];
xs.sort_unstable();
```

동일 key 안의 순서가 의미 없고, allocation을 피하고 싶으면 기본 선택지로 좋다.

### `sort_unstable_by`

unstable 버전의 `sort_by`.

```rust
items.sort_unstable_by(|a, b| a.score.cmp(&b.score));
```

custom comparator가 필요하지만 stable ordering은 필요 없을 때 쓴다.

### `sort_unstable_by_key`

unstable 버전의 `sort_by_key`.

```rust
items.sort_unstable_by_key(|item| item.score);
```

key 기준으로 간단히 정렬하고 싶고, 같은 key끼리 순서가 상관없으면 이게 깔끔하다.

## 선택 기준

동일한 key 안에서 기존 순서가 의미 있으면 stable 계열을 쓴다.

```rust
items.sort_by_key(|item| item.score);
```

동일한 key 안의 순서가 상관없으면 unstable 계열을 쓴다.

```rust
items.sort_unstable_by_key(|item| item.score);
```

key 계산이 싸면 `*_by_key`, key 계산이 비싸면 stable 계열에서는 `sort_by_cached_key`를 고려한다.

```rust
items.sort_by_cached_key(|item| expensive_key(item));
```

float처럼 total order가 애매한 타입은 그냥 `sort`를 못 쓰거나 쓰면 안 되는 경우가 있다. 이때는 `total_cmp`로 명시하는 식으로 정렬 기준을 확실하게 만든다.

```rust
floats.sort_by(|a, b| a.total_cmp(b));
```

## 공간복잡도만 다시 보면

stable 계열은 현재 Rust 구현상 보조 메모리를 사용할 수 있으므로 `O(n)`

unstable 계열은 in-place, no allocation이라 `O(1)`
