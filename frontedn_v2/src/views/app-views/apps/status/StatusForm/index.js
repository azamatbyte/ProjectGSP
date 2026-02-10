import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import StatusService from "services/StatusService";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircleOutlined, LeftCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";

const ADD = "ADD";
const EDIT = "EDIT";

const StatusForm = props => {
	const { t } = useTranslation();
	const { mode = ADD, param = {} } = props;
	const { id = "" } = param;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [submitLoading, setSubmitLoading] = useState(false);


	const formInformation = useCallback(async (id) => {
		try {
			const response = await StatusService.getById(id);
			const { name } = response?.data?.accessStatus;
			form.setFieldsValue({
				name
			});
		} catch (error) {
			console.error("Error:", error);
			message.error(t("no_data"));
		}
	}, [form, t]);

	useEffect(() => {
		if (mode === EDIT) {
			formInformation(id);
		}
	}, [mode, id, formInformation]);

	const backHandle = useCallback(() => {
		Modal.confirm({
			title: t("warning"),
			content: t("exit_confirmation"),
			okText: t("yes"),
			cancelText: t("no"),
			onOk: () => {
				navigate(-1);
			},
		});
	}, [navigate, t]);

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				backHandle();
			}
		};
		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [backHandle]);

	const onFinish = async () => {
		setSubmitLoading(true);
		if (mode === EDIT) {
			form.validateFields().then(async values => {
				const res = await StatusService.update(id, values);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success(t("status_updated_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		} else {
			form.validateFields().then(async values => {
				values.length = parseInt(values.length);
				const res = await StatusService.create(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success(t("status_created_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		}
	};

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					description: "",
					code: "",
					order: 0,
					active: true,
				}}
				onFinish={onFinish}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? t("add_new_status") : t("edit_status")} </h2>
							<div className="mb-3">
								<Button type="primary" htmlType="submit" loading={submitLoading} >
									{mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
									{mode === "ADD" ? t("add") : t("save")}
								</Button>
								<Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
							</div>
						</Flex>
					</div>
				</PageHeaderAlt>
				<div className="container">
					<Tabs
						defaultActiveKey="1"
						style={{ marginTop: 30 }}
						items={[
							{
								label: t("general"),
								key: "1",
								children: <GeneralField form={form} loading={submitLoading} />,
							},

						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default StatusForm;
