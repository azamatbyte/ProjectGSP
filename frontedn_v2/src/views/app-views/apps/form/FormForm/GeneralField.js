import React from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Select,
  InputNumber,
} from "antd";
import { useTranslation } from "react-i18next";


const { Option } = Select;

function onChange(value) {
  console.log(`selected ${value}`);
}

function onBlur() {
  console.log("blur");
}

function onFocus() {
  console.log("focus");
}

const GeneralField = (props) => {
  const { t } = useTranslation();
  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card title={t("basic_info")}>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="name" label={t("name")}>
                <Input
                  showSearch
                  className="w-100"
                  style={{ width: 200 }}
                  placeholder={t("name")}
                  optionFilterProp="children"
                  onChange={onChange}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  tabIndex={1}
                  maxLength={255}
                  // filterOption={(input, option) =>
                  // 	option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                  // }
                  autoFocus={true}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"1\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="description" label={t("description")}>
                <Input
                  className="w-100"
                  placeholder={t("description")}
                  tabIndex={2}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"2\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="length" label={t("length")}>
                <InputNumber
                  className="w-100"
                  tabIndex={3}
                  onChange={(value) => {
                    if (value !== undefined) {
                      value = Number(value);
                    }
                  }}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"3\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="month" label={t("month_form")}>
                <InputNumber
                  className="w-100"
                  tabIndex={4}
                  onChange={(value) => {
                    if (value !== undefined) {
                      value = Number(value);
                    }
                  }}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"4\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="type" label={t("type")}>
                <Select
                  className="w-100"
                  placeholder={t("type")}
                  tabIndex={5}
                  onChange={(value) => {
                    props.form.setFieldsValue({
                      type: value,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"10\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                >
                  <Option value="registration">{t("registration")}</Option>
                  <Option value="registration4">{t("registration4")}</Option>

                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
