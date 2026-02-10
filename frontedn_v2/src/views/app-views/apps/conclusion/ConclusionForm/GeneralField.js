import React from "react";
import { Input, Row, Col, Card, Form } from "antd";
import { useTranslation } from "react-i18next";

const GeneralField = (props) => {
  const { mode } = props;
  const { t } = useTranslation();
  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card title={t("basic_info")}>
          <Row gutter={16}>
            {mode === "ADD" && (
              <Col xs={24} sm={24} md={12}>
                <Form.Item
                  name="name"
                  label={t("name")}
                  rules={[{ required: true, message: t("please_enter_all_required_field") }]}
                >
                  <Input placeholder={t("name")} maxLength={255} autoFocus />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="title" label={t("main_title")}>
                <Input placeholder={t("main_title")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="to_who" label={t("to_who")}>
                <Input placeholder={t("to_who")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="to_position" label={t("to_position")}>
                <Input placeholder={t("to_position")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="to_organization" label={t("to_organization")}>
                <Input placeholder={t("to_organization")} maxLength={255} />
              </Form.Item>
            </Col>
            {/* <Col xs={24} sm={24} md={12}>
              <Form.Item name="file_name" label={t("file_name")}>
                <Input placeholder={t("file_name")} maxLength={255} />
              </Form.Item>
            </Col> */}
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="executor" label={t("executor")}>
                <Input placeholder={t("executor")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="boss" label={t("boss")}>
                <Input placeholder={t("boss")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="first_input" label={t("first_input")}>
                <Input placeholder={t("first_input")} maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="second_input" label={t("second_input")}>
                <Input placeholder={t("second_input")} maxLength={255} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
