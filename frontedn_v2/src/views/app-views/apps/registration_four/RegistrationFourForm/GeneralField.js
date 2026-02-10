import React, { useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  InputNumber,
  Select,
} from "antd";
import { useTranslation } from "react-i18next";
const { Option } = Select;

const GeneralField = () => {
  const { t } = useTranslation();

  const [registrationFourData, setRegistrationFourData] = useState({
    model: "",
    id: "",
    status: "",
  });
  const select_options = [
    {
      value: "all",
      label: t("all"),
    },
    {
      value: "accepted",
      label: t("access_granted"),
    },
    {
      value: "not_accepted",
      label: t("not_access"),
    },
    {
      value: "sp_accepted",
      label: t("sp_access_granted"),
    },
    {
      value: "not_checked",
      label: t("not_checked"),
    },
  ];

  const rules = {
    errorMsg: [
      {
        required: true,
        message: t("required_field"),
      },
    ],
  };

  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="lastName"
                label={t("last_name")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={2} readOnly/>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="firstName"
                label={t("first_name")}
                rules={rules.errorMsg}
              >
                <Input className="w-100" autoFocus readOnly/>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="fatherName"
                label={t("father_name")}
                // rules={rules.errorMsg}
              >
                <Input className="w-100" tabIndex={3} readOnly/>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="birthYear" label={t("birth_year")}>
                <InputNumber
                  className="w-100"
                  tabIndex={4}
                  onChange={(value) =>
                    setRegistrationFourData({ ...registrationFourData, birthYear: value })
                  }
                  readOnly
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="birthPlace" label={t("birth_place")}>
                <Input
                  value={registrationFourData.birthPlace}
                  onChange={(e) =>
                    setRegistrationFourData({
                      ...registrationFourData,
                      birthPlace: e.target.value,
                    })
                  }
                  tabIndex={21}
                  readOnly
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="residence"
                label={t("residence")}
              >
                <Input className="w-100"/>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="status" label={t("status")}>
                <Select
                >
                  {select_options.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="regNumber"
                label={t("reg_number")}
              >
                <Input className="w-100" readOnly/>
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
