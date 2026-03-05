describe.only('OOM exit code detection', function () {
  it('allocates until OOM', function () {
    const leak: Uint8Array[] = [];
    while (true) {
      leak.push(new Uint8Array(1_000_000));
    }
  });
});
