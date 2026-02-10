import { Tooltip } from "antd";
import i18n from "i18next";
// A generic helper that returns a tooltip-wrapped, truncated text if it exceeds maxLength.
const renderWithTooltip = (text, maxLength = 40) => {
  if (!text) {
    return <span>{i18n.t("unknown")}</span>;
  }

  if (text.length > maxLength) {
    const truncated = text.slice(0, maxLength) + "...";
    return (
      <Tooltip title={text}>
        <span
         style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "200px" }}
        >
          {truncated}
        </span>
      </Tooltip>
    );
  }

  return <span>{text}</span>;
};

export default renderWithTooltip;
