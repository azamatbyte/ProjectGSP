import React, { useState } from "react";
import { Modal, Form, Input, message } from "antd";
import { useTranslation } from "react-i18next";
import AuthService from "services/AuthService";

/**
 * superAdmin-only recovery: set another admin's password without knowing the old
 * one. The route is gated by permissionCheck("superAdmin") on the backend — this
 * component only hides the UI, it is not the security boundary.
 */
const ResetPasswordModal = ({ open, admin, onCancel, onSuccess }) => {
	const [form] = Form.useForm();
	const [submitting, setSubmitting] = useState(false);
	const { t } = useTranslation();

	const handleClose = () => {
		form.resetFields();
		onCancel();
	};

	const handleSubmit = async () => {
		let values;
		try {
			values = await form.validateFields();
		} catch {
			return;
		}

		setSubmitting(true);
		try {
			const res = await AuthService.resetPassword(admin.id, values.newPassword);

			if (res?.data?.code === 200) {
				message.success(t("password_reset_successfully"));
				form.resetFields();
				onSuccess();
			}
		} catch (error) {
			message.error(
				error?.response?.data?.message || t("something_went_wrong")
			);
		} finally {
			setSubmitting(false);
		}
	};

	const adminName = [admin?.first_name, admin?.last_name]
		.filter(Boolean)
		.join(" ") || admin?.username;

	return (
		<Modal
			title={t("reset_password_for", { name: adminName })}
			open={open}
			onOk={handleSubmit}
			onCancel={handleClose}
			okText={t("save")}
			cancelText={t("cancel")}
			confirmLoading={submitting}
			destroyOnClose
		>
			<Form form={form} layout="vertical" preserve={false}>
				<Form.Item
					name="newPassword"
					label={t("new_password")}
					rules={[
						{ required: true, message: t("please_enter_password") },
						{ min: 4, message: t("password_min_4") },
					]}
				>
					<Input.Password autoComplete="new-password" />
				</Form.Item>

				<Form.Item
					name="confirmPassword"
					label={t("confirm_new_password")}
					dependencies={["newPassword"]}
					rules={[
						{ required: true, message: t("please_confirm_new_password") },
						({ getFieldValue }) => ({
							validator(_, value) {
								if (!value || value === getFieldValue("newPassword")) {
									return Promise.resolve();
								}
								return Promise.reject(new Error(t("passwords_do_not_match")));
							},
						}),
					]}
				>
					<Input.Password autoComplete="new-password" />
				</Form.Item>
			</Form>
		</Modal>
	);
};

export default ResetPasswordModal;
