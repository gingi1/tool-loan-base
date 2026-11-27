const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const solc = require("solc");
const ganache = require("ganache");
const { ethers } = require("ethers");

const source = fs.readFileSync(path.join(__dirname, "ToolLoan.sol"), "utf8").replace(/^\uFEFF/, "");
const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "ToolLoan.sol": { content: source } },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }
})));
assert.deepEqual((output.errors || []).filter(error => error.severity === "error"), []);
const artifact = output.contracts["ToolLoan.sol"].ToolLoan;

async function fixture(t) {
  const engine = ganache.provider({ logging: { quiet: true } });
  t.after(() => engine.disconnect());
  const provider = new ethers.providers.Web3Provider(engine);
  const [lender, borrower, stranger] = await provider.listAccounts();
  const factory = new ethers.ContractFactory(
    artifact.abi, artifact.evm.bytecode.object, provider.getSigner(lender)
  );
  const loan = await (await factory.deploy()).deployed();
  const due = (await provider.getBlock("latest")).timestamp + 3600;
  return { engine, loan, lender, borrower, stranger, due,
    asBorrower: loan.connect(provider.getSigner(borrower)),
    asStranger: loan.connect(provider.getSigner(stranger)) };
}
const tool = ethers.utils.formatBytes32String("bohrmaschine-01");
const mine = async promise => (await promise).wait();

test("two wallets complete the drill loan and emit each confirmation", async t => {
  const { loan, lender, borrower, asBorrower, due } = await fixture(t);
  const creation = await mine(loan.offer(borrower, tool, due));
  const record = creation.events.find(event => event.event === "LoanOffered").args;
  assert.equal(record.loanId.toString(), "1");
  assert.equal(record.lender, lender);
  assert.equal(record.borrower, borrower);

  for (const [tx, state, actor] of [
    [() => asBorrower.accept(1), 2, borrower],
    [() => asBorrower.reportReturn(1), 3, borrower],
    [() => loan.confirmReturn(1), 4, lender]
  ]) {
    const receipt = await mine(tx());
    const event = receipt.events.find(item => item.event === "LoanStateChanged");
    assert.equal(event.args.state, state);
    assert.equal(event.args.actor, actor);
    assert.equal((await loan.loans(1)).state, state);
  }
  await assert.rejects(loan.callStatic.confirmReturn(1));
});

test("enforces roles, ordering, cancellation and expiry", async t => {
  const { engine, loan, lender, borrower, asBorrower, asStranger, due } = await fixture(t);
  await assert.rejects(loan.callStatic.offer(lender, tool, due));
  await assert.rejects(loan.callStatic.offer(ethers.constants.AddressZero, tool, due));
  await assert.rejects(loan.callStatic.offer(borrower, ethers.constants.HashZero, due));
  await assert.rejects(asBorrower.callStatic.accept(99));
  await mine(loan.offer(borrower, tool, due));
  await assert.rejects(loan.callStatic.accept(1));
  await assert.rejects(asStranger.callStatic.accept(1));
  await assert.rejects(asBorrower.callStatic.reportReturn(1));
  await assert.rejects(loan.callStatic.confirmReturn(1));
  await assert.rejects(asBorrower.callStatic.cancelOffer(1));
  await mine(asBorrower.accept(1));
  await assert.rejects(loan.callStatic.cancelOffer(1));
  await assert.rejects(loan.callStatic.reportReturn(1));
  await mine(asBorrower.reportReturn(1));
  await assert.rejects(asBorrower.callStatic.confirmReturn(1));

  await mine(loan.offer(borrower, tool, due));
  await mine(loan.cancelOffer(2));
  assert.equal((await loan.loans(2)).state, 5);
  await assert.rejects(asBorrower.callStatic.accept(2));

  await mine(loan.offer(borrower, tool, due));
  await engine.request({method: "evm_increaseTime", params: [3601]});
  await engine.request({method: "evm_mine", params: []});
  await assert.rejects(asBorrower.callStatic.accept(3));
  await mine(loan.confirmReturn(1));
});

test("browser ABI matches the compiled contract", () => {
  const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const js = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(js);
  const frontend = new ethers.utils.Interface(JSON.parse(
    page.match(/const abi = (\[[\s\S]*?\]);/)[1].replace(/,(\s*\])/g, "$1")
  ));
  const deployed = new ethers.utils.Interface(artifact.abi);
  for (const method of Object.values(frontend.functions)) {
    const actual = deployed.getFunction(method.name);
    assert.equal(frontend.getSighash(method), deployed.getSighash(actual));
    assert.equal(method.stateMutability, actual.stateMutability);
    assert.deepEqual(method.outputs.map(param => param.type), actual.outputs.map(param => param.type));
  }
  assert.equal(frontend.getEvent("LoanOffered").format(ethers.utils.FormatTypes.full),
    deployed.getEvent("LoanOffered").format(ethers.utils.FormatTypes.full));
});


test("the web app runs the complete loan with two local wallet sessions", async t => {
  const { engine, loan, lender, borrower, due } = await fixture(t);
  const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const provider = loan.provider;

  function browser(account, authorized = [account]) {
    const inputs = new Map();
    const element = () => ({
      children: [], replaceChildren(...items) { this.children = items; },
      append(...items) { this.children.push(...items); }
    });
    const get = id => {
      if (!inputs.has(id)) inputs.set(id, element());
      return inputs.get(id);
    };
    const wallet = {
      request: req => ["eth_requestAccounts", "eth_accounts"].includes(req.method)
        ? Promise.resolve(authorized)
        : req.method === "eth_chainId" ? Promise.resolve("0x14a34") : engine.request(req)
    };
    const library = {
      ...ethers, providers: {
        StaticJsonRpcProvider: class { constructor() { return provider; } },
        Web3Provider: class { constructor() { return provider; } }
      }
    };
    vm.runInNewContext(script, {
      document: { getElementById: get, createElement: element }, ethers: library,
      window: { ethers: library, ethereum: wallet, addEventListener: (_, callback) => callback() }
    });
    get("contract").value = loan.address;
    return get;
  }
  const owner = browser(lender);
  const renter = browser(lender, [lender, borrower]);
  const viewer = browser(undefined);
  const event = { preventDefault() {} };
  const load = async get => {
    get("loanId").value = "1";
    await get("load").onsubmit(event);
  };
  const state = get => get("receipt").children[0].children[5].textContent;

  await owner("connect").onclick();
  owner("borrower").value = borrower;
  owner("tool").value = "bohrmaschine-01";
  owner("due").value = new Date(due * 1000).toISOString();
  await owner("offer").onsubmit(event);
  assert.match(owner("status").textContent, /Ausleihe #1 bestätigt/);
  assert.equal(state(owner), "Angeboten");
  assert.equal(owner("accept").hidden, true);

  await renter("connect").onclick();
  assert.equal(renter("account").textContent, lender);
  assert.equal(renter("accountChoice").hidden, false);
  renter("walletAccount").value = borrower;
  renter("walletAccount").onchange();
  assert.equal(renter("account").textContent, borrower);
  await load(renter);
  assert.equal(renter("accept").hidden, false);
  await renter("accept").onclick();
  assert.equal(state(renter), "Ausgeliehen");
  assert.equal(renter("reportReturn").hidden, false);
  await renter("reportReturn").onclick();
  assert.equal(state(renter), "Rückgabe gemeldet");

  await load(owner);
  assert.equal(owner("confirmReturn").hidden, false);
  await owner("confirmReturn").onclick();
  assert.equal(state(owner), "Zurückgegeben");
  await load(viewer);
  assert.equal(state(viewer), "Zurückgegeben");
  assert.equal(viewer("confirmReturn").hidden, true);
});

