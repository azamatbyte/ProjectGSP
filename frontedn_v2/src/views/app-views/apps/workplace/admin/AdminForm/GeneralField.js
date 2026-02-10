import React, { useEffect } from "react";
import { Input, Row, Col, Card, Form, Select, DatePicker } from "antd";
import AuthService from "services/AuthService";
import { debounce } from "lodash";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import Request from "utils/request";

const { Option } = Select;

const GeneralField = (props) => {
  const { form, id, mode } = props;

  useEffect(() => {
	const fetchAdminData = async () => {
    if (mode === "EDIT") {
			const res = await AuthService.getById(id);
			form.setFieldsValue(res.data);
		}
	};
	fetchAdminData();
  }, [mode, id, form]);

  const handleChange = (value, key) => {
    if (key === "role") {
      form.setFieldsValue({ role: value === "admin" ? "admin" : "superAdmin" });
    } else if (key === "gender") {
      form.setFieldsValue({ gender: value === "male" ? "male" : "female" });
    }
  };

  const checkUsernameInDB = async (value, id) => {
    try {
      if (mode === "EDIT") {
        const res = await Request.getRequest(
          `auth/checkUsernameUpdate?username=${value}&&id=${id}`
        );
        if (res.status === 201) {
          return true;
        }
      } else {
        const res = await Request.getRequest(
          `auth/checkUsername?username=${value}`
        );
        if (res.status === 201) {
          return true;
        }
      }
      return false;
    } catch (error) {
      throw error;
    }
  };
  const debouncedCheckRegNumber = debounce((value, resolve, reject, id) => {
    checkUsernameInDB(value, id)
      .then((isValid) => {
        if (isValid) {
          resolve();
        } else {
          reject("Bu ro'yxat raqami allaqachon mavjud!");
        }
      })
      .catch(() => {
        reject("Tekshirish paytida xatolik yuz berdi");
      });
  }, 100);

  const rules = {
    username: [
      {
        required: true,
        message: "Iltimos, Username nomini kiriting",
      },
      ({ getFieldValue }) => ({
        validator(_, value) {
          if (!value) return Promise.resolve();
          return new Promise((resolve, reject) => {
            debouncedCheckRegNumber(value, resolve, reject, id);
          });
        },
        validateTrigger: ["onChange"],
      }),
    ],
    first_name: [
      {
        required: true,
        message: "Iltimos, ismni kiriting",
      },
    ],
  };
  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card title="Basic Info">
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="first_name" label="First Name">
                <Input className="w-100" autoFocus />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="last_name" label="Last Name">
                <Input className="w-100" tabIndex={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="father_name" label="Father Name">
                <Input className="w-100" tabIndex={3} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="birthDate" label="Birth Date">
                <DatePicker
                  format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                  className="w-100"
                  tabIndex={4}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="gender" label="Gender" initialValue="male">
                <Select
                  placeholder="Select gender"
                  className="w-100"
                  onChange={(value) => handleChange(value, "gender")}
                  tabIndex={6}
                >
                  <Option value="male">Male</Option>
                  <Option value="female">Female</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="role" label="Role" initialValue="admin">
                <Select
                  placeholder="Select role"
                  className="w-100"
                  onChange={(value) => handleChange(value, "role")}
                  tabIndex={7}
                >
                  <Option value="superAdmin">Super Admin</Option>
                  <Option value="admin">Admin</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="username"
                label="Username"
                hasFeedback
                validateTrigger={["onChange"]}
                rules={rules.username}
              >
                <Input
                  className="w-100"
                  tabIndex={8}
                  autoComplete="new-username"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="password" label="Password">
                <Input.Password tabIndex={9} autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
