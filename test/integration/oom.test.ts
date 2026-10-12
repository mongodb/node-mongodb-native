describe.only('OOM exit code detection', function () {
  it('allocates until OOM', function () {
    const leak: object[] = [];
    while (true) {
      leak.push({ a: Array.from({ length: 1_000 }, (_, i) => ({ i })) });
    }
  });
});
