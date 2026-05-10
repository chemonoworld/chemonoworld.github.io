---
title: "Rust Smart Pointers"
description: "A practical guide to Rust smart pointers: Box, Rc, Arc, Cell, RefCell, Mutex, RwLock, Cow, and Pin."
pubDate: 2026-05-10
tags: ["Rust", "programming", "ownership"]
---

When people first learn Rust, they usually meet references first: `&T` and `&mut T`. A reference borrows a value; it does not own it.

Smart pointers are different. They behave like pointers, but they also encode extra ownership, borrowing, allocation, synchronization, or cleanup behavior. `Box<T>` owns a heap allocation. `Rc<T>` gives a value multiple owners in a single thread. `RefCell<T>` moves borrow checking from compile time to runtime.

The important question is not "which pointer is fancy?" It is "which ownership problem is this type solving?"

## What is a smart pointer?

In Rust, a smart pointer usually does one or more of these things:

- stores a value on the heap
- allows multiple owners of the same value
- enables controlled mutation behind an immutable reference
- synchronizes access across threads
- releases a resource when it is dropped
- behaves like a reference through `Deref`

Most smart pointers are ordinary structs with strong invariants. Rust's type system then uses those invariants to make ownership patterns explicit.

## Quick Summary

| Type | Main purpose | Thread-safe? | Typical use |
| --- | --- | --- | --- |
| `Box<T>` | Single owner for a heap allocation | depends on `T` | large values, recursive types, trait objects |
| `Rc<T>` | Single-thread reference counting | no | shared ownership in one thread |
| `Weak<T>` | Non-owning reference to an `Rc` allocation | no | breaking reference cycles |
| `Arc<T>` | Thread-safe reference counting | yes | shared ownership across threads |
| `Cell<T>` | Interior mutability by value replacement | no | small `Copy` values |
| `RefCell<T>` | Runtime borrow checking | no | single-thread interior mutability |
| `Mutex<T>` | Exclusive locked access | yes | mutable shared state across threads |
| `RwLock<T>` | Many readers or one writer | yes | shared state with many reads |
| `Cow<'a, T>` | Clone-on-write | depends on `T` | avoid allocation until mutation is needed |
| `Pin<P>` | Prevent moving a value in memory | depends on `P` | futures and self-referential abstractions |

## `Box<T>`

`Box<T>` stores a value on the heap and owns it. The stack holds only a pointer to the heap allocation.

```rust
let value = Box::new(10);

println!("{}", value);
```

There are three common reasons to use `Box<T>`.

First, recursive types. A recursive enum cannot contain itself directly because Rust would not know its size at compile time.

```rust
enum List {
    Cons(i32, Box<List>),
    Nil,
}
```

`Box<List>` has a known pointer size, so the enum becomes sized.

Second, large values. If a value is large enough that keeping it on the stack is undesirable, a `Box<T>` can move the storage to the heap.

```rust
let large = Box::new([0u8; 1024 * 1024]);
```

Third, trait objects. A `dyn Trait` value has dynamic size, so it must be placed behind a pointer.

```rust
trait Draw {
    fn draw(&self);
}

struct Button;

impl Draw for Button {
    fn draw(&self) {}
}

let item: Box<dyn Draw> = Box::new(Button);
```

Use `Box<T>` when you still want exactly one owner, but you need heap allocation or dynamic dispatch.

## `Rc<T>`

`Rc<T>` means reference-counted pointer. It lets several owners share the same allocation in a single thread. The value is dropped when the last `Rc<T>` is dropped.

```rust
use std::rc::Rc;

let a = Rc::new(String::from("hello"));
let b = Rc::clone(&a);
let c = Rc::clone(&a);

println!("{}", a);
println!("{}", b);
println!("{}", c);
```

`Rc::clone(&a)` does not clone the inner `String`. It only increments the reference count. Writing `Rc::clone(&a)` instead of `a.clone()` makes that intent clear.

`Rc<T>` is not thread-safe. If ownership must cross thread boundaries, use `Arc<T>`.

Also, `Rc<T>` does not by itself allow mutation of the inner value. It gives shared ownership, not shared mutable access.

## `Weak<T>`

`Rc<T>` can create reference cycles. If a parent owns a child with `Rc`, and the child owns the parent with another `Rc`, neither reference count reaches zero.

`Weak<T>` solves this by referring to an allocation without owning it.

```rust
use std::cell::RefCell;
use std::rc::{Rc, Weak};

struct Node {
    parent: RefCell<Weak<Node>>,
    children: RefCell<Vec<Rc<Node>>>,
}
```

A common tree pattern is:

- parent owns children with `Rc`
- child points back to parent with `Weak`

To access a `Weak<T>`, call `upgrade()`.

```rust
if let Some(parent) = node.parent.borrow().upgrade() {
    println!("parent exists");
}
```

If the original allocation has already been dropped, `upgrade()` returns `None`.

## `Arc<T>`

`Arc<T>` is an atomically reference-counted pointer. It is the thread-safe version of `Rc<T>`.

```rust
use std::sync::Arc;
use std::thread;

let shared = Arc::new(String::from("hello"));

let handle = {
    let shared = Arc::clone(&shared);
    thread::spawn(move || {
        println!("{}", shared);
    })
};

handle.join().unwrap();
```

Like `Rc<T>`, `Arc<T>` provides shared ownership, not mutation. If multiple threads need to mutate shared state, combine it with a synchronization primitive.

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));

let handles: Vec<_> = (0..4)
    .map(|_| {
        let counter = Arc::clone(&counter);
        thread::spawn(move || {
            let mut value = counter.lock().unwrap();
            *value += 1;
        })
    })
    .collect();

for handle in handles {
    handle.join().unwrap();
}

println!("{}", counter.lock().unwrap());
```

Use `Arc<T>` when shared ownership must be valid across threads.

## `Cell<T>`

`Cell<T>` provides interior mutability. That means the value can be changed through a shared reference.

`Cell<T>` works by replacing values rather than lending references into the inner value. It is best for small `Copy` types.

```rust
use std::cell::Cell;

let count = Cell::new(0);

count.set(count.get() + 1);

println!("{}", count.get());
```

Use `Cell<T>` for simple single-thread mutation such as counters, flags, or cached small values.

## `RefCell<T>`

`RefCell<T>` also provides interior mutability, but it does so with runtime borrow checking.

```rust
use std::cell::RefCell;

let value = RefCell::new(vec![1, 2, 3]);

value.borrow_mut().push(4);

println!("{:?}", value.borrow());
```

The rules are the same as normal Rust borrowing:

- any number of immutable borrows
- or one mutable borrow
- but not both at the same time

The difference is when the rules are checked. With normal references, Rust checks them at compile time. With `RefCell<T>`, Rust checks them at runtime.

```rust
use std::cell::RefCell;

let value = RefCell::new(1);

let _a = value.borrow();
let _b = value.borrow_mut(); // panic
```

`RefCell<T>` does not remove Rust's borrowing rules. It delays enforcement. If the rules are violated, the program panics.

## `Rc<RefCell<T>>`

`Rc<RefCell<T>>` is a common single-thread pattern for shared mutable ownership.

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

This pattern appears in graphs, trees, observer lists, and other structures where several owners need to point at the same state.

It is useful, but it should not be the default. It makes ownership less obvious and introduces runtime borrow failures. Prefer plain ownership and borrowing first; reach for `Rc<RefCell<T>>` when the shape of the data really needs it.

## `Mutex<T>`

`Mutex<T>` allows one thread at a time to access the inner value. Calling `lock()` returns a guard. When the guard is dropped, the lock is released.

```rust
use std::sync::Mutex;

let value = Mutex::new(1);

{
    let mut guard = value.lock().unwrap();
    *guard += 1;
}

println!("{}", value.lock().unwrap());
```

`Mutex<T>` is the basic tool for mutable shared state across threads. If the state must have multiple owners, it is usually wrapped in `Arc`.

```rust
use std::sync::{Arc, Mutex};

let shared = Arc::new(Mutex::new(Vec::<i32>::new()));
```

One practical detail: if a thread panics while holding a `Mutex`, the mutex becomes poisoned. Many examples use `lock().unwrap()`, but production code should decide how to handle poisoning.

## `RwLock<T>`

`RwLock<T>` allows many readers or one writer.

```rust
use std::sync::RwLock;

let value = RwLock::new(vec![1, 2, 3]);

{
    let read = value.read().unwrap();
    println!("{:?}", *read);
}

{
    let mut write = value.write().unwrap();
    write.push(4);
}
```

Use `RwLock<T>` when reads are common and writes are relatively rare. If writes are frequent, or the access pattern is simple, `Mutex<T>` is often easier and good enough.

## `Cow<'a, T>`

`Cow` means clone-on-write. It can hold either a borrowed value or an owned value. It clones only when ownership is needed.

```rust
use std::borrow::Cow;

fn normalize(input: &str) -> Cow<'_, str> {
    if input.contains(' ') {
        Cow::Owned(input.replace(' ', "-"))
    } else {
        Cow::Borrowed(input)
    }
}

let a = normalize("hello");
let b = normalize("hello world");

println!("{a}");
println!("{b}");
```

`Cow<'a, T>` is useful when most inputs can be reused as borrowed data, but some inputs need transformation. It is common in string processing, parsing, and APIs that want to avoid unnecessary allocation.

## `Pin<P>`

`Pin<P>` prevents the value behind a pointer from being moved in memory. Here, `P` is a pointer type such as `Box<T>` or `&mut T`.

Most Rust values can be moved. Usually that is fine. But some abstractions rely on a stable memory address. Examples include self-referential data structures and async futures.

```rust
use std::pin::Pin;

let value = Box::pin(String::from("hello"));
let pinned: Pin<Box<String>> = value;
```

Most application code does not need to use `Pin` directly. It appears more often inside async runtimes, future implementations, and unsafe abstractions. If you need to implement pinned types yourself, you also need to understand `Unpin`, projection, and the invariants around unsafe code.

## `Deref` and `Drop`

Smart pointers feel like references because many of them implement `Deref`.

```rust
use std::ops::Deref;

struct MyBox<T>(T);

impl<T> Deref for MyBox<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
```

`Deref` allows `*value` access and enables deref coercion. For example, `&Box<String>` can often be used where `&str` is expected.

`Drop` runs cleanup code when a value goes out of scope.

```rust
struct Resource;

impl Drop for Resource {
    fn drop(&mut self) {
        println!("cleanup");
    }
}
```

This is the basis of Rust's RAII style. `Box<T>` frees heap memory, `Rc<T>` and `Arc<T>` decrement reference counts, and lock guards release locks when dropped.

## Choosing the Right Pointer

If there is one owner and heap allocation is needed, use `Box<T>`.

```rust
let value = Box::new(MyLargeType::new());
```

If there are multiple owners in one thread, use `Rc<T>`.

```rust
let shared = Rc::new(value);
```

If there are multiple owners across threads, use `Arc<T>`.

```rust
let shared = Arc::new(value);
```

If a single-threaded value needs interior mutation, consider `Cell<T>` or `RefCell<T>`.

```rust
let count = Cell::new(0);
let items = RefCell::new(Vec::new());
```

If a multi-threaded value needs mutation, use `Mutex<T>` or `RwLock<T>`.

```rust
let shared = Arc::new(Mutex::new(value));
```

If copying should happen only when mutation is needed, use `Cow<'a, T>`.

```rust
fn f(input: &str) -> Cow<'_, str> {
    Cow::Borrowed(input)
}
```

If a value must not move in memory, look at `Pin<P>`.

```rust
let future = Box::pin(async { 1 });
```

## Common Combinations

Smart pointers are often combined.

| Pattern | Meaning |
| --- | --- |
| `Rc<T>` | single-thread shared immutable ownership |
| `Rc<RefCell<T>>` | single-thread shared mutable ownership |
| `Arc<T>` | multi-thread shared immutable ownership |
| `Arc<Mutex<T>>` | multi-thread shared mutable ownership |
| `Arc<RwLock<T>>` | multi-thread shared state with many reads |
| `Box<dyn Trait>` | heap-allocated trait object |
| `Pin<Box<T>>` | heap allocation with stable address |

The most common pair to compare is `Rc<RefCell<T>>` versus `Arc<Mutex<T>>`.

| Single-thread | Multi-thread |
| --- | --- |
| `Rc<T>` | `Arc<T>` |
| `RefCell<T>` | `Mutex<T>` |
| `Rc<RefCell<T>>` | `Arc<Mutex<T>>` |

## Closing Notes

Smart pointers are not escape hatches from Rust's ownership model. They are ways to express ownership models that plain references cannot represent cleanly.

Start with ordinary ownership: `T`, `&T`, and `&mut T`. Use `Box<T>` when heap allocation is needed. Use `Rc<T>` or `Arc<T>` for shared ownership. Use `Cell<T>`, `RefCell<T>`, `Mutex<T>`, or `RwLock<T>` when mutation must happen through shared access. Use `Weak<T>` to avoid cycles. Use `Cow<'a, T>` to avoid unnecessary allocation. Use `Pin<P>` when stable memory location is part of the abstraction.

Most smart pointer choices come down to three questions:

- Is there one owner or many?
- Is the data single-threaded or shared across threads?
- Does the inner value need to change?

Answer those, and the right smart pointer is usually straightforward.
