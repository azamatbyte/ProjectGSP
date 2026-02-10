import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import InitiatorService from "services/InitiatorService";
import { useNavigate } from "react-router-dom";
import Request from "utils/request";
import { useTranslation } from "react-i18next";
import { CheckCircleOutlined, LeftCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const InitiatorForm = props => {

	const { mode = ADD, param = {} } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [submitLoading, setSubmitLoading] = useState(false);
	const { id = "" } = param;
	const { t } = useTranslation();


	const initiatorInformation = useCallback(async (id) => {
		try {
			const response = await Request.getRequest(`initiator/getById?id=${id}`);
			const { first_name, last_name, father_name, notes } = response?.data?.initiator;
			form.setFieldsValue({
				first_name,
				last_name,
				father_name,
				notes
			});
		} catch (error) {
			console.error("Xatolik:", error);
			message.error(t());
		}
	}, [form, t]);

	useEffect(() => {
		if (mode === EDIT) {
			initiatorInformation(id);
		}
	}, [mode, id, initiatorInformation]);


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
		if (submitLoading) return;
		if (mode === EDIT) {
			form.validateFields().then(async values => {
				const res = await InitiatorService.update(id, values);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success(t("initiator_updated_successfully"));
					navigate("/app/initiator-list");
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		} else {
			form.validateFields().then(async values => {
				const res = await InitiatorService.create(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success(t("initiator_created_successfully"));
					navigate("/app/initiator-list");
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
				onFinish={onFinish}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? t("add_new_initiator") : t("edit_initiator")} </h2>
							<div className="mb-3">
								<Button type="primary" tabIndex={5} htmlType="submit" onClick={onFinish} loading={submitLoading} >
									{mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
									{mode === "ADD" ? t("add") : t("save")}
								</Button>
								<Button className="ml-2" onClick={backHandle} tabIndex={6}><LeftCircleOutlined />{t("back")}</Button>
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

export default InitiatorForm;
