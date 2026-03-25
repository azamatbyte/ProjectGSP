const formatQuerySignerDisplayName = (item) =>
  `${item?.lastName ? item.lastName : ""} ${item?.firstName ? item.firstName.slice(0, 1) + "." : ""}${item?.fatherName ? item.fatherName.slice(0, 1) + "." : ""}`.trim();

const splitQuerySigners = (signList = []) => {
  const orderedSigners = Array.isArray(signList) ? signList.filter(Boolean) : [];

  if (!orderedSigners.length) {
    return {
      headerSigner: null,
      agreedSigners: [],
    };
  }

  return {
    headerSigner: orderedSigners[0],
    agreedSigners:
      orderedSigners.length > 1 ? orderedSigners.slice(1) : [orderedSigners[0]],
  };
};

const getQueryApprovalLabelMode = (signList = []) => {
  const signerCount = Array.isArray(signList) ? signList.filter(Boolean).length : 0;

  return signerCount >= 3 ? "afterFirst" : "none";
};

const buildQuerySignedListBlocks = (
  signList = [],
  dateText = "____ __________ 20__года",
  { approvalLabelMode = "first" } = {}
) =>
  (Array.isArray(signList) ? signList : [])
    .filter(Boolean)
    .map((item, idx, arr) => {
      const shouldAddApprovalLabel =
        approvalLabelMode === "none"
          ? false
          : approvalLabelMode === "afterFirst"
            ? idx >= 1
          : approvalLabelMode === "all"
            ? true
          : approvalLabelMode === "first"
            ? idx === 0
            : idx === arr.length - 1;
      const lines = [
        String(item?.position || "").trim(),
        String(item?.workplace || "").trim(),
        [String(item?.rank + "                        " || ""), formatQuerySignerDisplayName(item)]
          .filter(Boolean)
          .join("     ")
          .trim(),
        dateText,
      ].filter(Boolean);

      return lines.join("\n");
    });

module.exports = {
  buildQuerySignedListBlocks,
  formatQuerySignerDisplayName,
  getQueryApprovalLabelMode,
  splitQuerySigners,
};
