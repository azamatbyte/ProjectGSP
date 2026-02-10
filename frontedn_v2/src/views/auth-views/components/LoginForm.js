import React, { useEffect, useRef } from "react";
import { connect } from "react-redux";
import { Button, Form, Input, Divider, Alert } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import PropTypes from "prop-types";
import {
  signIn,
  showLoading,
  showAuthMessage,
  hideAuthMessage,
} from "store/slices/authSlice";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
export const LoginForm = (props) => {
  const navigate = useNavigate();
  const usernameInputRef = useRef(null);
  const { t } = useTranslation();

  

  const {
    otherSignIn,
    showForgetPassword,
    hideAuthMessage,
    onForgetPasswordClick,
    showLoading,
    extra,
    signIn,
    token,
    loading,
    redirect,
    showMessage,
    message,
    allowRedirect = true,
  } = props;

  useEffect(() => {
    // Focus username input on component mount
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }

    if (token !== null && allowRedirect) {
      navigate(redirect);
    }
    if (showMessage) {
      const timer = setTimeout(() => hideAuthMessage(), 3000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [token, allowRedirect, navigate, redirect, showMessage, hideAuthMessage]);

  const initialCredential = {
    username: "",
    password: "",
  };

  const onLogin = (values) => {
    showLoading();
    signIn(values);
  };

  useEffect(() => {
    if (token !== null && allowRedirect) {
      navigate(redirect);
    }
    if (showMessage) {
      const timer = setTimeout(() => hideAuthMessage(), 3000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [token, allowRedirect, navigate, redirect, showMessage, hideAuthMessage]);

  const renderOtherSignIn = (
    <div>
      <Divider>
        <span className="text-muted font-size-base font-weight-normal">
          or connect with
        </span>
      </Divider>
    </div>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, marginBottom: 0 }}
        animate={{
          opacity: showMessage ? 1 : 0,
          marginBottom: showMessage ? 20 : 0,
        }}
      >
        {(() => {
          switch (message.split(" ")[message.split(" ").length - 1]) {
            case "400":
              return <Alert type="error" showIcon message={t("auth_400")} />;
            case "404":
              return <Alert type="error" showIcon message={t("auth_404")} />;
            case "402":
              return <Alert type="error" showIcon message={t("auth_402")} />;
            case "500":
              return <Alert type="error" showIcon message={t("auth_500")} />;
            default:
              return (
                <Alert type="error" showIcon message={message.split(" ")[0]} />
              );
          }
        })()}
      </motion.div>
      <Form
        layout="vertical"
        name="login-form"
        initialValues={initialCredential}
        onFinish={onLogin}
      >
        <Form.Item
          name="username"
          label={t("username")}
          rules={[
            {
              required: true,
              message: t("please_enter_username"),
            },
            {
              type: "username",
              message: t("please_enter_a_validate_username"),
            },
          ]}
        >
          <Input
            prefix={<UserOutlined className="text-primary" />}
            tabIndex={1}
            ref={usernameInputRef}
          />
        </Form.Item>
        <Form.Item
          name="password"
          label={
            <div
              className={`${
                showForgetPassword
                  ? "d-flex justify-content-between w-100 align-items-center"
                  : ""
              }`}
            >
              <span>{t("password")}</span>
              {showForgetPassword && (
                <span
                  onClick={() => onForgetPasswordClick}
                  className="cursor-pointer font-size-sm font-weight-normal text-muted"
                >
                  {t("forget_password")}
                </span>
              )}
            </div>
          }
          rules={[
            {
              required: true,
              message: t("please_enter_password"),
            },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined className="text-primary" />}
            tabIndex={2}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t("signIn")}
          </Button>
        </Form.Item>
        {otherSignIn ? renderOtherSignIn : null}
        {extra}
      </Form>
    </>
  );
};

LoginForm.propTypes = {
  otherSignIn: PropTypes.bool,
  showForgetPassword: PropTypes.bool,
  extra: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
};

LoginForm.defaultProps = {
  otherSignIn: true,
  showForgetPassword: false,
};

const mapStateToProps = ({ auth }) => {
  const { loading, message, showMessage, token, redirect } = auth;
  return { loading, message, showMessage, token, redirect };
};

const mapDispatchToProps = {
  signIn,
  showAuthMessage,
  showLoading,
  hideAuthMessage,
};

export default connect(mapStateToProps, mapDispatchToProps)(LoginForm);
