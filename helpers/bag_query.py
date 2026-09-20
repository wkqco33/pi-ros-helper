#!/usr/bin/env python3
import json, sys
import rosbag2_py

def main():
    request = json.load(sys.stdin)
    bag = request["bagPath"]
    storage = request.get("storageId", "")
    reader = rosbag2_py.SequentialReader()
    reader.open(rosbag2_py.StorageOptions(uri=bag, storage_id=storage), rosbag2_py.ConverterOptions("", ""))
    wanted = request.get("topic")
    limit = max(1, min(int(request.get("limit", 100)), 1000))
    rows, gaps = [], []
    previous = None
    while reader.has_next() and len(rows) < limit:
        topic, data, timestamp = reader.read_next()
        if wanted and topic != wanted:
            continue
        if previous is not None and timestamp - previous > int(request.get("gapNanoseconds", 1_000_000_000)):
            gaps.append({"from": previous, "to": timestamp, "durationNanoseconds": timestamp - previous})
        previous = timestamp
        rows.append({"topic": topic, "timestampNanoseconds": timestamp, "serializedBytes": len(data)})
    print(json.dumps({"topic": wanted, "samples": rows, "gaps": gaps, "count": len(rows)}))

if __name__ == "__main__":
    main()
