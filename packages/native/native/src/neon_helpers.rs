// use crate::tokio_runtime::spawn_future;
use neon::prelude::*;
use serde::Serialize;
use std::future::Future;

pub trait ModuleContextExt {
  fn export_with<'a, V, F>(&mut self, name: &str, f: F) -> NeonResult<()>
  where
    Self: Context<'a>,
    V: Value,
    F: for<'r> FnOnce(&'r mut Self) -> JsResult<'a, V>;
}

impl ModuleContextExt for ModuleContext<'_> {
  fn export_with<'a, V, F>(&mut self, name: &str, f: F) -> NeonResult<()>
  where
    Self: Context<'a>,
    V: Value,
    F: for<'r> FnOnce(&'r mut Self) -> JsResult<'a, V>,
  {
    let value = f(self)?;
    self.export_value(name, value)?;
    Ok(())
  }
}

pub trait NeonNamespace {
  fn set_function<'a, C, V>(self, cx: &mut C, name: &str, f: fn(FunctionContext) -> JsResult<V>) -> NeonResult<()>
  where
    C: Context<'a>,
    V: Value;

  fn set_with<'a, C, V, F>(self, cx: &mut C, name: &str, f: F) -> NeonResult<()>
  where
    C: Context<'a>,
    V: Value,
    F: for<'r> FnOnce(&'r mut C) -> JsResult<'a, V>;
}

impl NeonNamespace for Handle<'_, JsObject> {
  fn set_function<'a, C: Context<'a>, V: Value>(
    self,
    cx: &mut C,
    name: &str,
    f: fn(FunctionContext) -> JsResult<V>,
  ) -> NeonResult<()> {
    let f = JsFunction::new(cx, f)?;
    self.set(cx, name, f)?;
    Ok(())
  }

  fn set_with<'a, C, V, F>(self, cx: &mut C, name: &str, f: F) -> NeonResult<()>
  where
    C: Context<'a>,
    V: Value,
    F: for<'r> FnOnce(&'r mut C) -> JsResult<'a, V>,
  {
    let v = f(cx)?;
    self.set(cx, name, v)?;
    Ok(())
  }
}

// // We return a `Result` here even if it never fails to simplify the caller code.
// #[allow(clippy::unnecessary_wraps)]
// pub(crate) fn resolve_callback_with<'a, C: Context<'a>, T: 'static + Send, ToJs>(
//   cx: &mut C,
//   fut: impl Future<Output = T> + Send + 'static,
//   cb: Root<JsFunction>,
//   to_js: ToJs,
// ) -> JsResult<'a, JsUndefined>
// where
//   ToJs: 'static + Send + for<'r> FnOnce(&mut TaskContext<'r>, T) -> Result<Handle<'r, JsValue>, Handle<'r, JsValue>>,
// {
//   let queue = cx.channel();
//   spawn_future(Box::pin(async move {
//     let res = fut.await;
//     queue.send(move |mut cx| {
//       let res = to_js(&mut cx, res);
//       let cb = cb.into_inner(&mut cx);
//       let this = cx.null();
//       let (err, res): (Handle<JsValue>, Handle<JsValue>) = match res {
//         Ok(value) => (cx.null().upcast(), value),
//         Err(e) => (e, cx.null().upcast()),
//       };
//       let _ = cb.call(&mut cx, this, vec![err, res])?;
//       Ok(())
//     })
//   }));
//
//   Ok(cx.undefined())
// }
//
// // We return a `Result` here even if it never fails to simplify the caller code.
// #[allow(clippy::unnecessary_wraps)]
// pub(crate) fn resolve_callback_serde<'a, C: Context<'a>, T: Serialize>(
//   cx: &mut C,
//   fut: impl Future<Output = Result<T, AnyError>> + Send + 'static,
//   cb: Root<JsFunction>,
// ) -> JsResult<'a, JsUndefined> {
//   let queue = cx.channel();
//   spawn_future(Box::pin(async move {
//     let res = fut.await;
//     let res = match res {
//       Ok(v) => match serde_json::to_string(&v) {
//         Ok(v) => Ok(v),
//         Err(e) => Err(Box::new(e) as AnyError),
//       },
//       Err(e) => Err(e),
//     };
//     let res = res.map_err(|e| e.to_string());
//     queue.send(move |mut cx| {
//       let cb = cb.into_inner(&mut cx);
//       let this = cx.null();
//       let (err, res): (Handle<JsValue>, Handle<JsValue>) = match res {
//         Ok(value) => (cx.null().upcast(), cx.string(value).upcast()),
//         Err(e) => (JsError::error(&mut cx, e)?.upcast(), cx.null().upcast()),
//       };
//       let _ = cb.call(&mut cx, this, vec![err, res])?;
//       Ok(())
//     })
//   }));
//
//   Ok(cx.undefined())
// }
