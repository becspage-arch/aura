import path from "node:path";
import protobuf from "protobufjs";

// Loads CQG .proto set from worker/proto/*
export async function loadCqgRoot() {
  const protoRootDir = path.resolve(process.cwd(), "proto");

  const root = new protobuf.Root();

  // Make protobufjs resolve imports like "common/decimal.proto"
  // and also handle absolute paths on Windows correctly.
  root.resolvePath = function (_origin, target) {
    // If protobufjs hands us an absolute path, don't prefix protoRootDir.
    if (path.isAbsolute(target)) return target;

    // Normal relative imports (e.g. "common/decimal.proto")
    return path.join(protoRootDir, target);
  };

  // Load the entry proto (it imports the rest)
  const entry = path.join(protoRootDir, "WebAPI", "webapi_2.proto");
  await root.load(entry, { keepCase: true });

  root.resolveAll();
  return root;
}
