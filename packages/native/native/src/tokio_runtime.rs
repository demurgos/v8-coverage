// use once_cell::sync::OnceCell;
// use std::future::Future;
// use std::pin::Pin;
// use tokio::runtime::Runtime;
// use tokio::sync::mpsc;
// use tokio::sync::mpsc::error::SendError;
//
// pub(crate) enum Message {
//   Task(Pin<Box<dyn Future<Output = ()> + Send>>),
//   // Shutdown,
// }
//
// fn get_tokio_sender() -> &'static mpsc::UnboundedSender<Message> {
//   static SENDER: OnceCell<mpsc::UnboundedSender<Message>> = OnceCell::new();
//   SENDER.get_or_init(|| {
//     let (sender, mut receiver) = mpsc::unbounded_channel();
//     std::thread::spawn(move || {
//       let rt = Runtime::new().expect("Failed to create tokio runtime");
//       rt.block_on(async {
//         loop {
//           #[allow(clippy::single_match)]
//           match receiver.recv().await {
//             Some(Message::Task(fut)) => fut.await,
//             // Some(Message::Shutdown) => break,
//             None => {}
//           }
//         }
//       });
//       rt.shutdown_timeout(std::time::Duration::from_secs(5));
//     });
//
//     sender
//   })
// }
//
// pub(crate) fn try_spawn_future(task: Pin<Box<dyn Future<Output = ()> + Send>>) -> Result<(), SendError<Message>> {
//   get_tokio_sender().clone().send(Message::Task(task))
// }
//
// pub(crate) fn spawn_future(task: Pin<Box<dyn Future<Output = ()> + Send>>) {
//   match try_spawn_future(task) {
//     Ok(_) => {}
//     Err(_) => panic!("Failed to schedule async task on Tokio runtime"),
//   }
// }
