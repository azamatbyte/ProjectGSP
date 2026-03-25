const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildQuerySignedListBlocks,
  getQueryApprovalLabelMode,
  splitQuerySigners,
} = require("./querySignerLayout");

const makeSigner = (id) => ({
  id,
  lastName: `Last${id}`,
  firstName: `First${id}`,
  fatherName: `Father${id}`,
  position: `Position ${id}`,
  workplace: `Workplace ${id}`,
  rank: `Rank ${id}`,
});

test("splitQuerySigners uses the single signer for both header and agreed blocks", () => {
  const signer = makeSigner(1);
  const { headerSigner, agreedSigners } = splitQuerySigners([signer]);

  assert.equal(headerSigner, signer);
  assert.deepEqual(agreedSigners, [signer]);
});

test("splitQuerySigners uses the first signer for header and the second signer for agreed block", () => {
  const signers = [makeSigner(1), makeSigner(2)];
  const { headerSigner, agreedSigners } = splitQuerySigners(signers);

  assert.equal(headerSigner, signers[0]);
  assert.deepEqual(agreedSigners, [signers[1]]);
});

test("splitQuerySigners keeps all signers from the second onward in agreed order", () => {
  const signers = [makeSigner(1), makeSigner(2), makeSigner(3)];
  const { headerSigner, agreedSigners } = splitQuerySigners(signers);

  assert.equal(headerSigner, signers[0]);
  assert.deepEqual(agreedSigners, [signers[1], signers[2]]);
});

test("getQueryApprovalLabelMode hides approval labels for one or two total signers", () => {
  assert.equal(getQueryApprovalLabelMode([]), "none");
  assert.equal(getQueryApprovalLabelMode([makeSigner(1)]), "none");
  assert.equal(getQueryApprovalLabelMode([makeSigner(1), makeSigner(2)]), "none");
});

test("getQueryApprovalLabelMode starts approval labels from C when there are three or more total signers", () => {
  assert.equal(
    getQueryApprovalLabelMode([makeSigner(1), makeSigner(2), makeSigner(3)]),
    "afterFirst"
  );
  assert.equal(
    getQueryApprovalLabelMode([makeSigner(1), makeSigner(2), makeSigner(3), makeSigner(4)]),
    "afterFirst"
  );
});

test("buildQuerySignedListBlocks omits approval labels in none mode", () => {
  const agreedBlocks = buildQuerySignedListBlocks(
    [makeSigner(1), makeSigner(2)],
    "DATE",
    { approvalLabelMode: "none" }
  );

  assert.equal(agreedBlocks.length, 2);
  assert.equal(agreedBlocks[0].split("\n").length, 4);
  assert.equal(agreedBlocks[1].split("\n").length, 4);
});

test("buildQuerySignedListBlocks adds approval labels from the second agreed signer onward", () => {
  const agreedBlocks = buildQuerySignedListBlocks(
    [makeSigner(2), makeSigner(3), makeSigner(4)],
    "DATE",
    { approvalLabelMode: "afterFirst" }
  );

  assert.equal(agreedBlocks.length, 3);
  assert.equal(agreedBlocks[0].split("\n").length, 4);
  assert.equal(agreedBlocks[1].split("\n").length, 5);
  assert.equal(agreedBlocks[2].split("\n").length, 5);
  assert.match(agreedBlocks[0], /Last2 F\.F\./);
  assert.match(agreedBlocks[1], /Last3 F\.F\./);
  assert.match(agreedBlocks[2], /Last4 F\.F\./);
});

test("splitQuerySigners plus approval mode keeps the first signer out of agreed blocks for 2+ signers", () => {
  const signers = [makeSigner(1), makeSigner(2), makeSigner(3)];
  const { agreedSigners } = splitQuerySigners(signers);
  const agreedBlocks = buildQuerySignedListBlocks(
    agreedSigners,
    "DATE",
    { approvalLabelMode: getQueryApprovalLabelMode(signers) }
  );

  assert.equal(agreedBlocks.length, 2);
  assert.doesNotMatch(agreedBlocks.join("\n"), /Last1 F\.F\./);
  assert.match(agreedBlocks.join("\n"), /Last2 F\.F\./);
  assert.match(agreedBlocks.join("\n"), /Last3 F\.F\./);
});
