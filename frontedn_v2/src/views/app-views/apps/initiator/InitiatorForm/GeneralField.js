import React from "react";
import { Input, Row, Col, Card, Form } from "antd";
import { useTranslation } from "react-i18next";

const GeneralField = () => {

	const { t } = useTranslation();


	const rules = {
		name: [
			{
				required: true,
				message: t("please_fill_out_field"),
			},
		]
	};

	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card>
					<Row gutter={16}>
						<Col xs={24} sm={24} md={8}>
							<Form.Item name="last_name" label={t("last_name")} rules={rules.name}>
								<Input
									className="w-100"
									tabIndex={1}
									autoFocus
									maxLength={255}
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
						<Col xs={24} sm={24} md={8}>
							<Form.Item name="first_name" label={t("first_name")} rules={rules.name}>
								<Input
									className="w-100"
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
						<Col xs={24} sm={24} md={8}>
							<Form.Item name="father_name" label={t("father_name")} rules={rules.name}>
								<Input
									className="w-100"
									tabIndex={3}
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
							<Form.Item name="notes"label={t("notes")}>
								<Input
									className="w-100"
									tabIndex={4}
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
						
						
					</Row>
				</Card>

			</Col>
		</Row>
	);
};

export default GeneralField;
