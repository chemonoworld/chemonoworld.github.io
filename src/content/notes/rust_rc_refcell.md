---
title: "Rc and RefCell in Rust"
description: "Rust에서 Rc, RefCell, Rc<RefCell<T>>를 언제 쓰는지 간략 정리."
pubDate: 2026-05-09
category: "TIL"
tags: ["Rust", "programming", "ownership"]
---

Rust의 기본 규칙은 "소유자는 하나, mutable borrow도 한 번에 하나"다. 대부분은 이 규칙 그대로 설계하는 게 제일 좋지만, 그래프나 트리처럼 여러 곳에서 같은 값을 가리켜야 하거나, immutable reference 뒤에서 값을 바꿔야 하는 경우가 있다. 이때 자주 나오는 타입이 `Rc`와 `RefCell`이다.

## 한 줄 요약

| type | 해결하는 문제 | 검사 시점 | thread-safe? |
| --- | --- | --- | --- |
| `Rc<T>` | 하나의 값을 여러 owner가 공유 | compile time | no |
| `RefCell<T>` | immutable owner 안의 값을 변경 | runtime | no |
| `Rc<RefCell<T>>` | 여러 owner가 공유하고 내부 값도 변경 | runtime borrow check | no |

멀티스레드에서는 `Rc` 대신 `Arc`, `RefCell` 대신 보통 `Mutex`나 `RwLock`을 쓴다.

## `Rc<T>`

`Rc`는 reference counted pointer다. 값을 heap에 두고, 그 값을 가리키는 owner 수를 센다. 마지막 `Rc`가 drop될 때 실제 값도 drop된다.

```rust
use std::rc::Rc;

let a = Rc::new(String::from("hello"));
let b = Rc::clone(&a);
let c = Rc::clone(&a);

println!("{}", a);
println!("{}", b);
println!("{}", c);
```

`Rc::clone(&a)`는 안의 `String`을 복사하는 게 아니라 reference count만 증가시킨다. 그래서 보통 `a.clone()`보다 `Rc::clone(&a)`처럼 써서 "비싼 복사가 아니라 공유 owner 증가"라는 의도를 드러낸다.

다만 `Rc<T>`만으로는 내부 값을 마음대로 바꿀 수 없다. 여러 owner가 같은 값을 공유하므로, Rust는 기본적으로 mutable access를 허용하지 않는다.

## `RefCell<T>`

`RefCell`은 borrow rule을 compile time이 아니라 runtime에 검사한다. 즉, 컴파일러가 정적으로 증명하기 어려운 borrowing을 허용하되, 규칙을 어기면 실행 중 panic이 난다.

```rust
use std::cell::RefCell;

let value = RefCell::new(1);

*value.borrow_mut() += 1;

println!("{}", value.borrow());
```

`borrow()`는 immutable borrow, `borrow_mut()`는 mutable borrow를 만든다. 규칙은 일반 reference와 같다.

- immutable borrow는 여러 개 가능
- mutable borrow는 하나만 가능
- mutable borrow와 immutable borrow는 동시에 불가능

차이는 이 규칙을 runtime에 확인한다는 점이다.

```rust
use std::cell::RefCell;

let value = RefCell::new(1);

let _a = value.borrow();
let _b = value.borrow_mut(); // panic
```

`_a`가 살아 있는 동안 `borrow_mut()`를 호출했기 때문에 panic이 난다.

## `Rc<RefCell<T>>`

`Rc<RefCell<T>>`는 "여러 곳에서 같은 값을 공유하면서, 그 값을 바꿔야 할 때" 쓰는 조합이다.

```rust
use std::cell::RefCell;
use std::rc::Rc;

let shared = Rc::new(RefCell::new(vec![1, 2, 3]));

let a = Rc::clone(&shared);
let b = Rc::clone(&shared);

a.borrow_mut().push(4);
b.borrow_mut().push(5);

println!("{:?}", shared.borrow());
```

대표적으로 parent pointer가 있는 tree, graph node, observer/listener 목록처럼 여러 구조가 같은 상태를 들고 있어야 할 때 나온다.

## 선택 기준

소유자가 하나면 그냥 `T`, `&T`, `&mut T`를 먼저 쓴다.

여러 owner가 필요하지만 값 변경은 필요 없으면 `Rc<T>`를 쓴다.

```rust
let node = Rc::new(Node { value: 1 });
```

owner는 하나인데 내부 값을 바꿔야 하고, compile time borrow check로 표현하기 어려우면 `RefCell<T>`를 고려한다.

```rust
let cache = RefCell::new(HashMap::new());
```

여러 owner가 필요하고 내부 값도 바꿔야 하면 `Rc<RefCell<T>>`를 쓴다.

```rust
type SharedNode = Rc<RefCell<Node>>;
```

## 주의할 점

`RefCell`은 Rust의 borrow rule을 없애는 타입이 아니다. 검사 시점을 runtime으로 미루는 타입이다. 그래서 잘못 쓰면 컴파일 에러 대신 panic을 만난다.

`Rc`는 cycle을 만들 수 있다. 예를 들어 parent와 child가 서로 `Rc`로 잡고 있으면 reference count가 0이 되지 않아 메모리가 해제되지 않는다. 이런 경우 한쪽은 `Weak<T>`를 써서 cycle을 끊는다.

```rust
use std::rc::{Rc, Weak};

struct Node {
    parent: Weak<Node>,
}
```

정리하면 `Rc`는 공유 ownership, `RefCell`은 interior mutability, `Rc<RefCell<T>>`는 둘을 같이 쓰는 패턴이다. 가능하면 일반 reference와 ownership으로 먼저 풀고, 구조상 필요한 지점에만 제한적으로 쓰는 게 좋다.
