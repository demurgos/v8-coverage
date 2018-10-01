#[derive(Eq, PartialEq, Clone, Debug)]
pub struct RangeTree {
  start: usize,
  end: usize,
  count: isize,
  children: Vec<RangeTree>
}
