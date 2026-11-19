//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import crypto from "crypto";

const sha256_hex_length = 64;

function sha256_hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digests_match(left, right) {
  if (left.length !== sha256_hex_length || right.length !== sha256_hex_length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < sha256_hex_length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function edge_auth_valid(r) {
  const expected = (r.variables.edge_auth_secret_sha256 || "").toLowerCase();

  if (expected.length !== sha256_hex_length) {
    return "0";
  }

  const presented = r.headersIn["X-Edge-Auth"];

  if (typeof presented !== "string" || presented === "") {
    return "0";
  }

  return digests_match(sha256_hex(presented), expected) ? "1" : "0";
}

export default { edge_auth_valid, digests_match, sha256_hex };
