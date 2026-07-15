import React, { useState } from "react";
import { Modal, Form, Input, message } from "antd";
import { useTranslation } from "react-i18next";
import AuthService from "services/AuthService";

/**
 * Self-service password change. The backend derives the target account from the
 * auth token, so this can only ever change the signed-in user's own password.
 *
 * Changing the password invalidates every existing session (the backend deletes
 * the user's refresh tokens), so the caller is expected to sign the user out on
 * success — that is what `onSuccess` is for.
 */
const ChangePasswordModal = ({ open, onCancel, onSuccess }) => {
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
			return; // antd already rendered the field-level errors
		}

		setSubmitting(true);
		try {
			const res = await AuthService.changePassword(
				values.oldPassword,
				values.newPassword
			);

			if (res?.data?.code === 200) {
				message.success(t("password_changed_successfully"));
				form.resetFields();
				onSuccess();
			}
		} catch (error) {
			// The backend answers 400 both for a wrong current password and for a
			// new password that fails validation; surface its message.
			const apiMessage = error?.response?.data?.message;
			message.error(
				apiMessage === "Old password is incorrect"
					? t("old_password_incorrect")
					: apiMessage || t("something_went_wrong")
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			title={t("change_password")}
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
					name="oldPassword"
					label={t("current_password")}
					rules={[
						{ required: true, message: t("please_enter_current_password") },
					]}
				>
					<Input.Password autoComplete="current-password" />
				</Form.Item>

				<Form.Item
					name="newPassword"
					label={t("new_password")}
					rules={[
						{ required: true, message: t("please_enter_password") },
						{ min: 4, message: t("password_min_4") },
						({ getFieldValue }) => ({
							validator(_, value) {
								if (!value || value !== getFieldValue("oldPassword")) {
									return Promise.resolve();
								}
								return Promise.reject(new Error(t("new_password_must_differ")));
							},
						}),
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

export default ChangePasswordModal;
