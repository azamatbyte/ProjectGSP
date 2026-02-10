import React from "react";
import { Dropdown } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import PropTypes from "prop-types";

const EllipsisDropdown = ({ menu, placement, trigger }) => {
  return (
    <Dropdown 
      menu={menu} 
      placement={placement} 
      trigger={[trigger]}
    >
      <div className="ellipsis-dropdown" style={{ cursor: "pointer" }}>
        <EllipsisOutlined />
      </div>
    </Dropdown>
  );
};

EllipsisDropdown.propTypes = {
  trigger: PropTypes.string,
  placement: PropTypes.string,
  menu: PropTypes.object.isRequired
};

EllipsisDropdown.defaultProps = {
  trigger: "click",
  placement: "bottomRight"
};

export default EllipsisDropdown;